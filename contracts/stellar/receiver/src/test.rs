extern crate std;

use soroban_sdk::{
    address_payload::AddressPayload, contract, contracterror, contractimpl, contracttype, testutils::Address as _,
    token, Address, Bytes, BytesN, Env,
};
use std::vec::Vec;

use crate::{message, Error, InletReceiver, InletReceiverClient, CROSS_MARGIN_ADAPTER};

// The message Circle attested for the first direct mint into a Soroban contract, Arc burn 0x980e5ec7 on 2026-09-19.
const RECORDED: &str = "000000010000001a0000001b8f786b739316714d7f1d342c9ebbc6b091635136cd888b05182af0d16185d6310000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daada6f9ee0786c812344d82817ef19b648b4af120f8bd10bf658e6b99eacff24b86d0afce4e7dac4d47f8529b5d754381a914f0bed6bf9c17b5be025779d41c0c7000007d0000007d00000000100000000000000000000000036000000000000000000000000000000000000006d0afce4e7dac4d47f8529b5d754381a914f0bed6bf9c17b5be025779d41c0c700000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000fdea5ebbe7970a00792562e1c5299215cf6a3813000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000696e6c65742070726f6265";

fn word(env: &Env, bytes: &Bytes, at: u32) -> BytesN<32> {
    let mut out = [0u8; 32];
    bytes.slice(at..at + 32).copy_into_slice(&mut out);
    BytesN::from_array(env, &out)
}

fn low(env: &Env, bytes: &Bytes, at: u32) -> i128 {
    let raw = word(env, bytes, at).to_array();
    let mut out = [0u8; 16];
    out.copy_from_slice(&raw[16..]);
    u128::from_be_bytes(out) as i128
}

#[contracttype]
enum TransmitterKey {
    Token,
    Used(BytesN<32>),
}

/// Behaves like Circle's transmitter and minter where it matters: the caller must be the destination caller and must authorise, a nonce works once, the mint is ten times the net amount.
#[contract]
struct MockTransmitter;

#[contractimpl]
impl MockTransmitter {
    pub fn set_token(env: Env, token: Address) {
        env.storage().instance().set(&TransmitterKey::Token, &token);
    }

    pub fn receive_message(env: Env, caller: Address, message: Bytes, _attestation: Bytes) -> bool {
        caller.require_auth();
        let nonce = word(&env, &message, 12);
        let used = TransmitterKey::Used(nonce);
        assert!(!env.storage().persistent().has(&used), "nonce used");
        env.storage().persistent().set(&used, &true);
        let allowed = Address::from_payload(&env, AddressPayload::ContractIdHash(word(&env, &message, 108)));
        assert!(allowed == caller, "invalid caller for message");
        let to = Address::from_payload(&env, AddressPayload::ContractIdHash(word(&env, &message, 148 + 36)));
        let net = low(&env, &message, 148 + 68) - low(&env, &message, 148 + 164);
        let token: Address = env.storage().instance().get(&TransmitterKey::Token).unwrap();
        token::StellarAssetClient::new(&env, &token).mint(&to, &(net * 10));
        true
    }
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
enum MarketError {
    Frozen = 90,
}

#[contracttype]
enum MarketKey {
    Usdc,
    Frozen,
    Balance(Address),
}

/// The shape Noether agreed for its market: the payer authorises, the market pulls the USDC, the beneficiary is credited.
#[contract]
struct MockMarket;

#[contractimpl]
impl MockMarket {
    pub fn init(env: Env, usdc: Address) {
        env.storage().instance().set(&MarketKey::Usdc, &usdc);
    }

    pub fn freeze(env: Env, on: bool) {
        env.storage().instance().set(&MarketKey::Frozen, &on);
    }

    pub fn deposit_cross_margin_for(env: Env, payer: Address, beneficiary: Address, amount: i128) -> Result<(), MarketError> {
        if env.storage().instance().get(&MarketKey::Frozen).unwrap_or(false) {
            return Err(MarketError::Frozen);
        }
        payer.require_auth();
        let usdc: Address = env.storage().instance().get(&MarketKey::Usdc).unwrap();
        token::Client::new(&env, &usdc).transfer(&payer, &env.current_contract_address(), &amount);
        let key = MarketKey::Balance(beneficiary);
        let total: i128 = env.storage().persistent().get(&key).unwrap_or(0) + amount;
        env.storage().persistent().set(&key, &total);
        Ok(())
    }

    pub fn balance(env: Env, who: Address) -> i128 {
        env.storage().persistent().get(&MarketKey::Balance(who)).unwrap_or(0)
    }
}

struct World {
    env: Env,
    receiver: Address,
    market: Address,
    usdc: Address,
    hub: [u8; 32],
    trader: [u8; 32],
}

impl World {
    fn new() -> World {
        let env = Env::default();
        let transmitter = env.register(MockTransmitter, ());
        let usdc = env.register_stellar_asset_contract_v2(transmitter.clone()).address();
        MockTransmitterClient::new(&env, &transmitter).set_token(&usdc);
        let market = env.register(MockMarket, ());
        MockMarketClient::new(&env, &market).init(&usdc);
        let mut hub = [0u8; 32];
        hub[12..].copy_from_slice(&[0xe2; 20]);
        let admin = Address::generate(&env);
        let receiver = env.register(
            InletReceiver,
            (admin, usdc.clone(), transmitter, 26u32, BytesN::from_array(&env, &hub), market.clone()),
        );
        World { env, receiver, market, usdc, hub, trader: [7u8; 32] }
    }

    fn id(&self, address: &Address) -> [u8; 32] {
        match address.to_payload() {
            Some(AddressPayload::ContractIdHash(id)) => id.to_array(),
            _ => panic!("not a contract"),
        }
    }

    fn trader(&self) -> Address {
        Address::from_payload(&self.env, AddressPayload::AccountIdPublicKeyEd25519(BytesN::from_array(&self.env, &self.trader)))
    }

    fn client(&self) -> InletReceiverClient<'_> {
        InletReceiverClient::new(&self.env, &self.receiver)
    }

    fn held(&self, who: &Address) -> i128 {
        token::Client::new(&self.env, &self.usdc).balance(who)
    }
}

struct Draft {
    source_domain: u32,
    nonce: u8,
    caller: [u8; 32],
    recipient: [u8; 32],
    sender: [u8; 32],
    amount: u128,
    fee: u128,
    tag: [u8; 32],
    intent: u8,
    adapter: [u8; 32],
    beneficiary: [u8; 32],
}

impl Draft {
    fn from_hub(world: &World) -> Draft {
        let me = world.id(&world.receiver);
        Draft {
            source_domain: 26,
            nonce: 1,
            caller: me,
            recipient: me,
            sender: world.hub,
            amount: 2_000_000,
            fee: 260,
            tag: message::HOOK_TAG,
            intent: 1,
            adapter: CROSS_MARGIN_ADAPTER,
            beneficiary: world.trader,
        }
    }

    fn bytes(&self, env: &Env) -> Bytes {
        let mut out: Vec<u8> = Vec::new();
        let number = |value: u128, out: &mut Vec<u8>| {
            out.extend_from_slice(&[0u8; 16]);
            out.extend_from_slice(&value.to_be_bytes());
        };
        out.extend_from_slice(&1u32.to_be_bytes());
        out.extend_from_slice(&self.source_domain.to_be_bytes());
        out.extend_from_slice(&27u32.to_be_bytes());
        out.extend_from_slice(&[self.nonce; 32]);
        out.extend_from_slice(&[0x8f; 32]);
        out.extend_from_slice(&[0xcd; 32]);
        out.extend_from_slice(&self.caller);
        out.extend_from_slice(&2000u32.to_be_bytes());
        out.extend_from_slice(&2000u32.to_be_bytes());
        assert_eq!(out.len(), 148);
        out.extend_from_slice(&1u32.to_be_bytes());
        out.extend_from_slice(&[0x36; 32]);
        out.extend_from_slice(&self.recipient);
        number(self.amount, &mut out);
        out.extend_from_slice(&self.sender);
        number(self.fee, &mut out);
        number(self.fee, &mut out);
        number(0, &mut out);
        assert_eq!(out.len(), 148 + 228);
        out.extend_from_slice(&self.tag);
        out.extend_from_slice(&[self.intent; 32]);
        out.extend_from_slice(&self.adapter);
        out.extend_from_slice(&self.beneficiary);
        number(160, &mut out);
        number(0, &mut out);
        Bytes::from_slice(env, &out)
    }
}

fn proof(env: &Env) -> Bytes {
    Bytes::from_slice(env, &[0u8; 130])
}

#[test]
fn deposits_for_the_beneficiary_in_one_call_with_no_signature() {
    let world = World::new();
    let draft = Draft::from_hub(&world);
    let done = world.client().receive_and_execute(&draft.bytes(&world.env), &proof(&world.env));
    assert!(done);
    let net = (2_000_000 - 260) * 10;
    assert_eq!(MockMarketClient::new(&world.env, &world.market).balance(&world.trader()), net);
    assert_eq!(world.held(&world.market), net);
    assert_eq!(world.held(&world.receiver), 0);
    assert!(world.client().executed(&BytesN::from_array(&world.env, &[1u8; 32])));
    assert_eq!(world.client().claimable_of(&world.trader()), 0);
}

#[test]
fn a_second_message_for_the_same_intent_is_refused_and_mints_nothing() {
    let world = World::new();
    let mut draft = Draft::from_hub(&world);
    world.client().receive_and_execute(&draft.bytes(&world.env), &proof(&world.env));
    draft.nonce = 2;
    let again = world.client().try_receive_and_execute(&draft.bytes(&world.env), &proof(&world.env));
    assert_eq!(again, Err(Ok(Error::AlreadyExecuted)));
    assert_eq!(world.held(&world.receiver), 0);
}

#[test]
fn a_burn_that_did_not_come_from_the_hub_is_refused() {
    let world = World::new();
    let mut draft = Draft::from_hub(&world);
    draft.sender = [0xaa; 32];
    assert_eq!(
        world.client().try_receive_and_execute(&draft.bytes(&world.env), &proof(&world.env)),
        Err(Ok(Error::WrongOrigin))
    );
    let mut draft = Draft::from_hub(&world);
    draft.source_domain = 6;
    assert_eq!(
        world.client().try_receive_and_execute(&draft.bytes(&world.env), &proof(&world.env)),
        Err(Ok(Error::WrongOrigin))
    );
    assert_eq!(world.held(&world.receiver), 0);
}

#[test]
fn a_message_minted_to_someone_else_is_refused() {
    let world = World::new();
    let mut draft = Draft::from_hub(&world);
    draft.recipient = world.id(&world.market);
    assert_eq!(
        world.client().try_receive_and_execute(&draft.bytes(&world.env), &proof(&world.env)),
        Err(Ok(Error::WrongRecipient))
    );
}

#[test]
fn a_frame_without_the_inlet_tag_is_refused() {
    let world = World::new();
    let mut draft = Draft::from_hub(&world);
    draft.tag = [0x11; 32];
    assert_eq!(
        world.client().try_receive_and_execute(&draft.bytes(&world.env), &proof(&world.env)),
        Err(Ok(Error::BadPayload))
    );
}

#[test]
fn a_frozen_market_leaves_the_usdc_claimable_and_the_beneficiary_takes_it() {
    let world = World::new();
    MockMarketClient::new(&world.env, &world.market).freeze(&true);
    let draft = Draft::from_hub(&world);
    let done = world.client().receive_and_execute(&draft.bytes(&world.env), &proof(&world.env));
    assert!(!done);
    let net = (2_000_000 - 260) * 10;
    assert_eq!(world.client().claimable_of(&world.trader()), net);
    assert_eq!(world.held(&world.receiver), net);

    let nobody = world.client().try_claim(&world.trader(), &world.market);
    assert!(nobody.is_err());

    world.env.mock_all_auths();
    let safe = Address::generate(&world.env);
    assert_eq!(world.client().claim(&world.trader(), &safe), net);
    assert_eq!(world.held(&safe), net);
    assert_eq!(world.client().claimable_of(&world.trader()), 0);
    assert_eq!(world.client().try_claim(&world.trader(), &safe), Err(Ok(Error::NothingToClaim)));
}

#[test]
fn an_adapter_this_receiver_does_not_know_leaves_the_usdc_claimable() {
    let world = World::new();
    let mut draft = Draft::from_hub(&world);
    draft.adapter = [0x22; 32];
    assert!(!world.client().receive_and_execute(&draft.bytes(&world.env), &proof(&world.env)));
    assert_eq!(world.client().claimable_of(&world.trader()), (2_000_000 - 260) * 10);
}

#[test]
fn only_the_admin_repoints_the_market() {
    let world = World::new();
    let other = world.env.register(MockMarket, ());
    assert!(world.client().try_set_market(&other).is_err());
    world.env.mock_all_auths();
    world.client().set_market(&other);
    assert_eq!(world.client().config().market, other);
}

#[test]
fn reads_the_message_circle_attested_for_the_first_direct_mint() {
    let env = Env::default();
    let mut raw: Vec<u8> = Vec::new();
    for at in (0..RECORDED.len()).step_by(2) {
        raw.push(u8::from_str_radix(&RECORDED[at..at + 2], 16).unwrap());
    }
    let recorded = Bytes::from_slice(&env, &raw);
    let burn = message::burn(&env, &recorded).ok().unwrap();
    assert_eq!(burn.source_domain, 26);
    assert_eq!(burn.amount, 1_000_000);
    assert_eq!(burn.fee, 0);
    assert_eq!(burn.mint_recipient.to_array()[..4], [0x6d, 0x0a, 0xfc, 0xe4]);
    assert_eq!(burn.sender.to_array()[12..16], [0xfd, 0xea, 0x5e, 0xbb]);
    assert!(matches!(message::frame(&env, &recorded), Err(Error::BadPayload)));
}
