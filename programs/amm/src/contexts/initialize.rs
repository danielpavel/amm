use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::state::Config;

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Initialize<'info> {
    #[account(mut)]
    signer: Signer<'info>,

    mint_x: InterfaceAccount<'info, Mint>,
    mint_y: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = signer,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"amm", mint_x.key().as_ref(), mint_y.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump
    )]
    config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = signer,
        mint::authority = config,
        mint::decimals = 6,
        mint::token_program = token_program,
        seeds = [b"mint", config.key().as_ref()],
        bump

    )]
    mint_lp: InterfaceAccount<'info, Mint>,

    #[account(
        init, // There's no reason for this account to exist before this instruction, hence no
              // reason for `init_if_needed`
        payer = signer,
        associated_token::mint = mint_x,
        associated_token::authority = config,
        associated_token::token_program = token_program,
    )]
    vault_x: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init, // There's no reason for this account to exist before this instruction, hence no
              // reason for `init_if_needed`
        payer = signer,
        associated_token::mint = mint_y,
        associated_token::authority = config,
        associated_token::token_program = token_program,
    )]
    vault_y: InterfaceAccount<'info, TokenAccount>,

    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn initailize(&mut self, seed: u64, fee: u16, bumps: &InitializeBumps) -> Result<()> {
        self.config.set_inner(Config {
            seed,
            fee,
            mint_x: self.mint_x.key(),
            mint_y: self.mint_y.key(),
            lp_bump: bumps.mint_lp,
            bump: bumps.config,
            k: 0, // k = 0 means pool has no liquidity.
        });

        Ok(())
    }
}
