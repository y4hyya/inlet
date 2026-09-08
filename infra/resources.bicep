param location string
param environmentName string
@secure()
param relayerPrivateKey string
param arcRpc string
param baseSepoliaRpc string
param arbitrumSepoliaRpc string
param unichainSepoliaRpc string
param ethereumSepoliaRpc string
param corsOrigin string
@secure()
param uniswapApiKey string = ''
param relayerImage string = ''

var suffix = toLower(uniqueString(resourceGroup().id))
var tags = { 'azd-env-name': environmentName }

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'inlet-logs'
  location: location
  tags: tags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: 'inletacr${suffix}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'inlet-relayer-identity'
  location: location
  tags: tags
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, 'acrpull')
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'inletdata${suffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { minimumTlsVersion: 'TLS1_2', allowBlobPublicAccess: false }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: fileService
  name: 'relayer'
  properties: { shareQuota: 5 }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'inlet-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource environmentStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: environment
  name: 'relayer'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: share.name
      accessMode: 'ReadWrite'
    }
  }
}

resource relayer 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'inlet-relayer'
  location: location
  tags: union(tags, { 'azd-service-name': 'relayer' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [acrPull]
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: { external: true, targetPort: 8787, transport: 'http' }
      registries: [{ server: registry.properties.loginServer, identity: identity.id }]
      secrets: [
        { name: 'relayer-private-key', value: relayerPrivateKey }
        { name: 'uniswap-api-key', value: uniswapApiKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'relayer'
          image: !empty(relayerImage) ? relayerImage : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'RELAYER_PRIVATE_KEY', secretRef: 'relayer-private-key' }
            { name: 'PORT', value: '8787' }
            { name: 'DB_PATH', value: '/data/inlet.db' }
            { name: 'POLL_INTERVAL_MS', value: '3000' }
            { name: 'ARC_RPC', value: arcRpc }
            { name: 'BASE_SEPOLIA_RPC', value: baseSepoliaRpc }
            { name: 'ARBITRUM_SEPOLIA_RPC', value: arbitrumSepoliaRpc }
            { name: 'UNICHAIN_SEPOLIA_RPC', value: unichainSepoliaRpc }
            { name: 'ETHEREUM_SEPOLIA_RPC', value: ethereumSepoliaRpc }
            { name: 'CORS_ORIGIN', value: corsOrigin }
            { name: 'UNISWAP_API_KEY', secretRef: 'uniswap-api-key' }
          ]
          volumeMounts: [{ volumeName: 'data', mountPath: '/data' }]
          probes: [
            { type: 'Liveness', httpGet: { path: '/health', port: 8787 }, initialDelaySeconds: 10, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/health', port: 8787 }, initialDelaySeconds: 5, periodSeconds: 10 }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
      volumes: [{ name: 'data', storageType: 'AzureFile', storageName: environmentStorage.name, mountOptions: 'nobrl,cache=none' }]
    }
  }
}

output registryLoginServer string = registry.properties.loginServer
output relayerUrl string = 'https://${relayer.properties.configuration.ingress.fqdn}'
