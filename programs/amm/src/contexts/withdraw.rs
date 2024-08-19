use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        burn, transfer_checked, Burn, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::state::Config;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    taker: Signer<'info>,

    mint_x: InterfaceAccount<'info, Mint>,
    mint_y: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = taker,
    )]
    taker_ata_x: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = taker,
    )]
    taker_ata_y: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"mint", config.key().as_ref()],
        bump = config.lp_bump
    )]
    mint_lp: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = config,
    )]
    vault_x: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = config,
    )]
    vault_y: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_lp,
        associated_token::authority = taker,
    )]
    taker_lp_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"amm", mint_x.key().as_ref(), mint_y.key().as_ref(), config.seed.to_le_bytes().as_ref()],
        bump = config.bump
    )]
    config: Box<Account<'info, Config>>,

    associated_token_program: Program<'info, AssociatedToken>,
    token_program: Interface<'info, TokenInterface>,
    system_program: Program<'info, System>,
}

impl<'info> Withdraw<'info> {
    pub fn withdraw(&mut self, lp_amount: u64, min_x: u64, min_y: u64) -> Result<()> {
        let lp_supply = self.mint_lp.supply;
        let amount_vault_x = self.vault_x.amount;
        let amount_vault_y = self.vault_y.amount;

        let ratio = lp_supply
            .checked_add(lp_amount)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_div(lp_supply)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        let amount_x = min_x
            .checked_mul(ratio)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_sub(min_x)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let amount_y = min_y
            .checked_mul(ratio)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_sub(min_y)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        self.withdraw_tokens(amount_x, true)?;
        self.withdraw_tokens(amount_y, false)?;

        self.burn_lp_tokens(lp_amount)
    }

    fn withdraw_tokens(&mut self, amount: u64, is_x: bool) -> Result<()> {
        let seed = self.config.seed.to_le_bytes();
        let bump = [self.config.bump];
        let signer_seeds = [&[
            b"amm",
            self.mint_x.to_account_info().key.as_ref(),
            self.mint_y.to_account_info().key.as_ref(),
            seed.as_ref(),
            &bump,
        ][..]];

        let (from, to, mint) = match is_x {
            true => (
                self.vault_x.to_account_info(),
                self.taker_ata_x.to_account_info(),
                self.mint_x.clone(),
            ),
            false => (
                self.vault_y.to_account_info(),
                self.taker_ata_y.to_account_info(),
                self.mint_y.clone(),
            ),
        };

        let cpi_accounts = TransferChecked {
            mint: mint.to_account_info(),
            from,
            to,
            authority: self.config.to_account_info(),
        };

        let cpi_context = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            cpi_accounts,
            &signer_seeds,
        );

        transfer_checked(cpi_context, amount, mint.decimals)
    }

    pub fn burn_lp_tokens(&mut self, amount: u64) -> Result<()> {
        msg!("Burning LP tokens");

        let cpi_accounts = Burn {
            mint: self.mint_lp.to_account_info(),
            from: self.taker_lp_ata.to_account_info(),
            authority: self.taker.to_account_info(),
        };

        let cpi_context = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);

        burn(cpi_context, amount)
    }
}
