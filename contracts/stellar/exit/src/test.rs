extern crate std;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, MockAuth, MockAuthInvoke},
    token, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

use crate::{Error, ExitLeg, InletExit, InletExitClient};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
enum MarketError {
    InsufficientBalance = 40,
}

#[contracttype]
enum MarketKey {
    Usdc,
    Balance(Address),
}

/// The shape Noether agreed for the way out: the trader authorises, the market pays a recipient that is not the trader.
#[contract]
struct MockMarket;

#[contractimpl]
impl MockMarket {
    pub fn init(env: Env, usdc: Address) {
        env.storage().instance().set(&MarketKey::Usdc, &usdc);
    }

    pub fn credit(env: Env, trader: Address, amount: i128) {
        let key = MarketKey::Balance(trader);
        let total: i128 = env.storage().persistent().get(&key).unwrap_or(0) + amount;
        env.storage().persistent().set(&key, &total);
    }

    pub fn withdraw_cross_margin_to(env: Env, trader: Address, recipient: Address, amount: i128) -> Result<(), MarketError> {
        trader.require_auth();
        let key = MarketKey::Balance(trader.clone());
        let held: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if held < amount {
            return Err(MarketError::InsufficientBalance);
        }
        env.storage().persistent().set(&key, &(held - amount));
        let usdc: Address = env.storage().instance().get(&MarketKey::Usdc).unwrap();
        token::Client::new(&env, &usdc).transfer(&env.current_contract_address(), &recipient, &amount);
        Ok(())
    }

    pub fn get_cross_margin_balance(env: Env, trader: Address) -> i128 {
        env.storage().persistent().get(&MarketKey::Balance(trader)).unwrap_or(0)
    }
}

#[contracttype]
enum BurnKey {
    Count,
    Burn(u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
struct Burn {
    caller: Address,
    amount: i128,
    domain: u32,
    recipient: BytesN<32>,
    destination_caller: BytesN<32>,
    max_fee: i128,
    min_finality: u32,
}

/// Circle's token messenger where it matters: it pulls the USDC with the allowance the caller left, so a missing approve fails the call.
#[contract]
struct MockMessenger;

#[contractimpl]
impl MockMessenger {
    pub fn deposit_for_burn(
        env: Env,
        caller: Address,
        amount: i128,
        destination_domain: u32,
        mint_recipient: BytesN<32>,
        burn_token: Address,
        destination_caller: BytesN<32>,
        max_fee: i128,
        min_finality_threshold: u32,
    ) {
        // Circle takes the token's own seven decimals here and carries six in the message.
        token::Client::new(&env, &burn_token).transfer_from(&env.current_contract_address(), &caller, &env.current_contract_address(), &amount);
        let at: u32 = env.storage().instance().get(&BurnKey::Count).unwrap_or(0);
        env.storage().instance().set(
            &BurnKey::Burn(at),
            &Burn { caller, amount, domain: destination_domain, recipient: mint_recipient, destination_caller, max_fee, min_finality: min_finality_threshold },
        );
        env.storage().instance().set(&BurnKey::Count, &(at + 1));
    }

    pub fn burns(env: Env) -> u32 {
        env.storage().instance().get(&BurnKey::Count).unwrap_or(0)
    }

    pub fn burn(env: Env, at: u32) -> Option<Burn> {
        env.storage().instance().get(&BurnKey::Burn(at))
    }
}

struct World {
    env: Env,
    exit: Address,
    market: Address,
    messenger: Address,
    usdc: Address,
    trader: Address,
    admin: Address,
}

impl World {
    fn new() -> World {
        let env = Env::default();
        let issuer = Address::generate(&env);
        let usdc = env.register_stellar_asset_contract_v2(issuer.clone()).address();
        let market = env.register(MockMarket, ());
        let messenger = env.register(MockMessenger, ());
        let admin = Address::generate(&env);
        let trader = Address::generate(&env);
        let exit = env.register(InletExit, (admin.clone(), usdc.clone(), messenger.clone(), market.clone()));
        env.mock_all_auths();
        MockMarketClient::new(&env, &market).init(&usdc);
        token::StellarAssetClient::new(&env, &usdc).mint(&market, &100_000_000);
        MockMarketClient::new(&env, &market).credit(&trader, &50_000_000);
        env.mock_auths(&[]);
        World { env, exit, market, messenger, usdc, trader, admin }
    }

    fn client(&self) -> InletExitClient<'_> {
        InletExitClient::new(&self.env, &self.exit)
    }

    fn legs(&self, rows: &[(u32, u8, i128)]) -> Vec<ExitLeg> {
        let mut legs = Vec::new(&self.env);
        for (domain, tag, amount) in rows {
            legs.push_back(ExitLeg { domain: *domain, recipient: BytesN::from_array(&self.env, &[*tag; 32]), amount: *amount });
        }
        legs
    }

    fn held(&self, who: &Address) -> i128 {
        token::Client::new(&self.env, &self.usdc).balance(who)
    }

    fn margin(&self) -> i128 {
        MockMarketClient::new(&self.env, &self.market).get_cross_margin_balance(&self.trader)
    }
}

#[test]
fn takes_the_margin_out_and_burns_one_message_per_leg() {
    let world = World::new();
    world.env.mock_all_auths();
    let legs = world.legs(&[(6, 0xaa, 400_000), (3, 0xbb, 600_000)]);
    assert_eq!(world.client().execute(&world.trader, &legs, &0, &2000), 1_000_000);

    // Six decimals on the wire, seven in the market.
    assert_eq!(world.margin(), 50_000_000 - 10_000_000);
    let messenger = MockMessengerClient::new(&world.env, &world.messenger);
    assert_eq!(messenger.burns(), 2);
    let first = messenger.burn(&0).unwrap();
    assert_eq!(first.amount, 4_000_000);
    assert_eq!(first.domain, 6);
    assert_eq!(first.recipient, BytesN::from_array(&world.env, &[0xaa; 32]));
    assert_eq!(first.destination_caller, BytesN::from_array(&world.env, &[0u8; 32]));
    assert_eq!(first.max_fee, 0);
    assert_eq!(first.min_finality, 2000);
    assert_eq!(messenger.burn(&1).unwrap().domain, 3);
    assert_eq!(world.held(&world.messenger), 10_000_000);
    assert_eq!(world.held(&world.exit), 0);
}

#[test]
fn one_trader_signature_covers_the_withdrawal_and_the_burns() {
    let world = World::new();
    let legs = world.legs(&[(6, 0xaa, 250_000)]);
    world.env.mock_auths(&[MockAuth {
        address: &world.trader,
        invoke: &MockAuthInvoke {
            contract: &world.exit,
            fn_name: "execute",
            args: (world.trader.clone(), legs.clone(), 0i128, 2000u32).into_val(&world.env),
            sub_invokes: &[MockAuthInvoke {
                contract: &world.market,
                fn_name: "withdraw_cross_margin_to",
                args: (world.trader.clone(), world.exit.clone(), 2_500_000i128).into_val(&world.env),
                sub_invokes: &[],
            }],
        },
    }]);
    world.client().execute(&world.trader, &legs, &0, &2000);
    // Read straight after the call: any later invocation replaces what auths() reports.
    let tree = world.env.auths();

    assert_eq!(world.margin(), 50_000_000 - 2_500_000);
    let (who, AuthorizedInvocation { function, sub_invocations }) = tree.first().unwrap().clone();
    assert_eq!(who, world.trader);
    assert_eq!(function, AuthorizedFunction::Contract((world.exit.clone(), Symbol::new(&world.env, "execute"), (world.trader.clone(), legs, 0i128, 2000u32).into_val(&world.env))));
    // The market's own trader.require_auth() hangs under the same entry, so the wallet signs the tree once.
    assert_eq!(sub_invocations.len(), 1);
    assert_eq!(
        sub_invocations[0].function,
        AuthorizedFunction::Contract((world.market.clone(), Symbol::new(&world.env, "withdraw_cross_margin_to"), (world.trader.clone(), world.exit.clone(), 2_500_000i128).into_val(&world.env)))
    );
}

#[test]
fn nothing_moves_without_the_trader() {
    let world = World::new();
    let legs = world.legs(&[(6, 0xaa, 250_000)]);
    assert!(world.client().try_execute(&world.trader, &legs, &0, &2000).is_err());
    assert_eq!(world.margin(), 50_000_000);
    assert_eq!(MockMessengerClient::new(&world.env, &world.messenger).burns(), 0);
}

#[test]
fn a_leg_with_nothing_in_it_is_refused() {
    let world = World::new();
    world.env.mock_all_auths();
    let empty: Vec<ExitLeg> = Vec::new(&world.env);
    assert_eq!(world.client().try_execute(&world.trader, &empty, &0, &2000), Err(Ok(Error::NoLegs)));
    assert_eq!(world.client().try_execute(&world.trader, &world.legs(&[(6, 0xaa, 0)]), &0, &2000), Err(Ok(Error::BadLeg)));
    assert_eq!(world.client().try_execute(&world.trader, &world.legs(&[(6, 0x00, 100_000)]), &0, &2000), Err(Ok(Error::BadLeg)));
    assert_eq!(world.margin(), 50_000_000);
}

#[test]
fn a_withdrawal_the_market_refuses_burns_nothing() {
    let world = World::new();
    world.env.mock_all_auths();
    let legs = world.legs(&[(6, 0xaa, 9_000_000)]);
    assert!(world.client().try_execute(&world.trader, &legs, &0, &2000).is_err());
    assert_eq!(world.margin(), 50_000_000);
    assert_eq!(MockMessengerClient::new(&world.env, &world.messenger).burns(), 0);
    assert_eq!(world.held(&world.exit), 0);
}

#[test]
fn only_the_admin_repoints_the_market() {
    let world = World::new();
    let other = world.env.register(MockMarket, ());
    assert!(world.client().try_set_market(&other).is_err());
    world.env.mock_all_auths();
    world.client().set_market(&other);
    assert_eq!(world.client().config().market, other);
    assert_eq!(world.client().config().admin, world.admin);
}
