use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub seed: u64,
    pub fee: u16, // 5% fee = 500 basis points
    pub mint_x: Pubkey,
    pub mint_y: Pubkey,
    pub lp_bump: u8,
    pub bump: u8,
    pub k: u128, // invariant k = x * y
}
