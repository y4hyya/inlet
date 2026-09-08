# Infrastructure

Provisioned with the Azure Developer CLI. `main.bicep` creates the resource group `inlet` in the chosen region with a Log Analytics workspace, a container registry, a storage account whose file share holds the relayer's SQLite database, a Container Apps environment, and the relayer container app with one always on replica.

```
azd auth login
azd env new inlet
azd env set AZURE_LOCATION westeurope
azd env set RELAYER_PRIVATE_KEY <key>
azd up
```

The site in `UI` is deployed on Vercel, not here. Live relayer: https://inlet-relayer.wonderfulforest-6c3e22a4.westeurope.azurecontainerapps.io. `CORS_ORIGIN` on the container app lists the site origins allowed to call it.
