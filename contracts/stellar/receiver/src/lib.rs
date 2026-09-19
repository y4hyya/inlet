#![no_std]

use soroban_sdk::{
    address_payload::AddressPayload,
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractevent, contractimpl, contracttype, token, vec, Address, Bytes, BytesN, Env,
    IntoVal, Symbol, Val, Vec,
};

mod message;
#[cfg(test)]
mod test;

pub const CROSS_MARGIN_ADAPTER: [u8; 32] = [
    0xbf, 0x90, 0xf4, 0x61, 0x11, 0xed, 0x20, 0xe2, 0x41, 0x30, 0xa0, 0x8c, 0x92, 0x87, 0x00, 0x49,
    0x33, 0xa0, 0x31, 0x25, 0x84, 0x19, 0xe8, 0x21, 0xf5, 0x00, 0x1f, 0x54, 0x6c, 0xdc, 0x3e, 0x95,
];

const DAY: u32 = 17_280;
const KEEP_BELOW: u32 = 30 * DAY;
const KEEP_FOR: u32 = 120 * DAY;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ReceiveFailed = 1,
    MalformedMessage = 2,
    AmountTooLarge = 3,
    WrongRecipient = 4,
    WrongOrigin = 5,
    BadPayload = 6,
    AlreadyExecuted = 7,
    NothingToClaim = 8,
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub usdc: Address,
    pub transmitter: Address,
    pub hub_domain: u32,
    pub hub: BytesN<32>,
    pub market: Address,
}

#[contracttype]
pub enum DataKey {
    Config,
    Executed(BytesN<32>),
    Claimable(Address),
}

#[contractevent(topics = ["executed"])]
pub struct Executed {
    #[topic]
    pub intent_hash: BytesN<32>,
    pub adapter_id: BytesN<32>,
    pub beneficiary: Address,
    pub amount: i128,
}

#[contractevent(topics = ["claimable"])]
pub struct MadeClaimable {
    #[topic]
    pub intent_hash: BytesN<32>,
    pub beneficiary: Address,
    pub amount: i128,
}

#[contractevent(topics = ["claimed"])]
pub struct Claimed {
    #[topic]
    pub beneficiary: Address,
    pub to: Address,
    pub amount: i128,
}

/// Mint recipient and destination caller on Stellar. Mints through Circle, then deposits for the beneficiary in the same call, or keeps the USDC claimable.
#[contract]
pub struct InletReceiver;

#[contractimpl]
impl InletReceiver {
    pub fn __constructor(
        env: Env,
        admin: Address,
        usdc: Address,
        transmitter: Address,
        hub_domain: u32,
        hub: BytesN<32>,
        market: Address,
    ) {
        let config = Config { admin, usdc, transmitter, hub_domain, hub, market };
        env.storage().instance().set(&DataKey::Config, &config);
    }

    /// Anyone may call this. Only a message Circle attested, burned by the hub toward this contract, gets past the checks.
    pub fn receive_and_execute(env: Env, message: Bytes, attestation: Bytes) -> Result<bool, Error> {
        let config = Self::config(env.clone());
        env.storage().instance().extend_ttl(KEEP_BELOW, KEEP_FOR);

        let me = env.current_contract_address();
        let args: Vec<Val> = vec![&env, me.into_val(&env), message.into_val(&env), attestation.into_val(&env)];
        let received: bool = env.invoke_contract(&config.transmitter, &Symbol::new(&env, "receive_message"), args);
        if !received {
            return Err(Error::ReceiveFailed);
        }

        let burn = message::burn(&env, &message)?;
        match me.to_payload() {
            Some(AddressPayload::ContractIdHash(id)) if id == burn.mint_recipient => {}
            _ => return Err(Error::WrongRecipient),
        }
        if burn.source_domain != config.hub_domain || burn.sender != config.hub {
            return Err(Error::WrongOrigin);
        }
        let amount = burn
            .amount
            .checked_sub(burn.fee)
            .and_then(|net| net.checked_mul(10))
            .filter(|net| *net > 0)
            .ok_or(Error::AmountTooLarge)?;

        let frame = message::frame(&env, &message)?;
        let done = DataKey::Executed(frame.intent_hash.clone());
        if env.storage().persistent().has(&done) {
            return Err(Error::AlreadyExecuted);
        }
        env.storage().persistent().set(&done, &true);
        env.storage().persistent().extend_ttl(&done, KEEP_BELOW, KEEP_FOR);

        let beneficiary =
            Address::from_payload(&env, AddressPayload::AccountIdPublicKeyEd25519(frame.beneficiary.clone()));

        if frame.adapter_id.to_array() == CROSS_MARGIN_ADAPTER && Self::deposit(&env, &config, &beneficiary, amount) {
            Executed { intent_hash: frame.intent_hash, adapter_id: frame.adapter_id, beneficiary, amount }.publish(&env);
            return Ok(true);
        }

        let owed = DataKey::Claimable(beneficiary.clone());
        let total: i128 = env.storage().persistent().get(&owed).unwrap_or(0) + amount;
        env.storage().persistent().set(&owed, &total);
        env.storage().persistent().extend_ttl(&owed, KEEP_BELOW, KEEP_FOR);
        MadeClaimable { intent_hash: frame.intent_hash, beneficiary, amount }.publish(&env);
        Ok(false)
    }

    pub fn claim(env: Env, beneficiary: Address, to: Address) -> Result<i128, Error> {
        beneficiary.require_auth();
        let owed = DataKey::Claimable(beneficiary.clone());
        let amount: i128 = env.storage().persistent().get(&owed).unwrap_or(0);
        if amount <= 0 {
            return Err(Error::NothingToClaim);
        }
        env.storage().persistent().remove(&owed);
        let config = Self::config(env.clone());
        token::Client::new(&env, &config.usdc).transfer(&env.current_contract_address(), &to, &amount);
        Claimed { beneficiary, to, amount }.publish(&env);
        Ok(amount)
    }

    pub fn executed(env: Env, intent_hash: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Executed(intent_hash))
    }

    pub fn claimable_of(env: Env, beneficiary: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Claimable(beneficiary)).unwrap_or(0)
    }

    pub fn config(env: Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    pub fn set_market(env: Env, market: Address) {
        let mut config = Self::config(env.clone());
        config.admin.require_auth();
        config.market = market;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    pub fn upgrade(env: Env, wasm_hash: BytesN<32>) {
        Self::config(env.clone()).admin.require_auth();
        env.deployer().update_current_contract_wasm(wasm_hash);
    }
}

impl InletReceiver {
    /// The market pulls the USDC from this contract, so the transfer it makes is the one call authorised here.
    fn deposit(env: &Env, config: &Config, beneficiary: &Address, amount: i128) -> bool {
        let me = env.current_contract_address();
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: config.usdc.clone(),
                    fn_name: Symbol::new(env, "transfer"),
                    args: (me.clone(), config.market.clone(), amount).into_val(env),
                },
                sub_invocations: vec![env],
            }),
        ]);
        let args: Vec<Val> = vec![env, me.into_val(env), beneficiary.into_val(env), amount.into_val(env)];
        let outcome = env.try_invoke_contract::<Val, soroban_sdk::Error>(
            &config.market,
            &Symbol::new(env, "deposit_cross_margin_for"),
            args,
        );
        matches!(outcome, Ok(Ok(_)))
    }
}
