use soroban_sdk::{Bytes, BytesN, Env};

use crate::Error;

// CCTP V2 header: source domain 4, nonce 12, body 148.
// Burn body: mint recipient 36, amount 68, message sender 100, fee executed 164, hook data 228.
const BODY: u32 = 148;
const HOOK: u32 = BODY + 228;

pub const HOOK_TAG: [u8; 32] = [
    0x8f, 0x47, 0xe2, 0x8b, 0x81, 0x64, 0x78, 0xd3, 0xcb, 0x46, 0xcd, 0x66, 0xa2, 0xd6, 0x3f, 0x35,
    0xad, 0xfc, 0xc7, 0xe3, 0xf9, 0x33, 0x44, 0x66, 0x35, 0x51, 0x62, 0x56, 0xa2, 0x25, 0xdf, 0x93,
];

pub struct Burn {
    pub source_domain: u32,
    pub mint_recipient: BytesN<32>,
    pub sender: BytesN<32>,
    pub amount: i128,
    pub fee: i128,
}

pub struct Frame {
    pub intent_hash: BytesN<32>,
    pub adapter_id: BytesN<32>,
    pub beneficiary: BytesN<32>,
}

fn word(env: &Env, bytes: &Bytes, at: u32) -> Result<BytesN<32>, Error> {
    if bytes.len() < at + 32 {
        return Err(Error::MalformedMessage);
    }
    let mut out = [0u8; 32];
    bytes.slice(at..at + 32).copy_into_slice(&mut out);
    Ok(BytesN::from_array(env, &out))
}

fn amount(env: &Env, bytes: &Bytes, at: u32) -> Result<i128, Error> {
    let raw = word(env, bytes, at)?.to_array();
    if raw[..16].iter().any(|byte| *byte != 0) {
        return Err(Error::AmountTooLarge);
    }
    let mut low = [0u8; 16];
    low.copy_from_slice(&raw[16..]);
    i128::try_from(u128::from_be_bytes(low)).map_err(|_| Error::AmountTooLarge)
}

pub fn burn(env: &Env, message: &Bytes) -> Result<Burn, Error> {
    if message.len() < HOOK {
        return Err(Error::MalformedMessage);
    }
    let mut domain = [0u8; 4];
    message.slice(4..8).copy_into_slice(&mut domain);
    Ok(Burn {
        source_domain: u32::from_be_bytes(domain),
        mint_recipient: word(env, message, BODY + 36)?,
        sender: word(env, message, BODY + 100)?,
        amount: amount(env, message, BODY + 68)?,
        fee: amount(env, message, BODY + 164)?,
    })
}

/// The hub's frame is abi.encode(tag, intentHash, adapterId, beneficiary, adapterData).
pub fn frame(env: &Env, message: &Bytes) -> Result<Frame, Error> {
    let hook = message.slice(HOOK..message.len());
    if word(env, &hook, 0).map_err(|_| Error::BadPayload)?.to_array() != HOOK_TAG {
        return Err(Error::BadPayload);
    }
    let length = amount(env, &hook, 160).map_err(|_| Error::BadPayload)?;
    let length = u32::try_from(length).map_err(|_| Error::BadPayload)?;
    if hook.len() < 192 + length {
        return Err(Error::BadPayload);
    }
    Ok(Frame {
        intent_hash: word(env, &hook, 32)?,
        adapter_id: word(env, &hook, 64)?,
        beneficiary: word(env, &hook, 96)?,
    })
}
