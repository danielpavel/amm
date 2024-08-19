use anchor_lang::prelude::*;

declare_id!("DocSNPbey9uJ5W9817nfc5wGyDhrrXFJ4ujK76a7AUCY");

pub mod contexts;
pub mod state;

pub use contexts::*;

#[program]
pub mod amm {
    use super::*;

    // Initialize a pool
    pub fn initialize(ctx: Context<Initialize>, seed: u64, fee: u16) -> Result<()> {
        ctx.accounts.initailize(seed, fee, &ctx.bumps)?;
        Ok(())
    }

    // Deposit liquidity into the pool to mint LP tokens
    pub fn deposit(ctx: Context<Deposit>, max_x: u64, max_y: u64) -> Result<()> {
        ctx.accounts.deposit(max_x, max_y)
    }

    // Burn LP tokens to withdraw liquidity
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64, min_x: u64, min_y: u64) -> Result<()> {
        ctx.accounts.withdraw(amount, min_x, min_y)
    }

    pub fn swap(ctx: Context<Swap>, amount: u64, min_receive: u64, is_x: bool) -> Result<()> {
        // deposit_token_x
        // withdraw_token_y
        //
        Ok(())
    }
}
