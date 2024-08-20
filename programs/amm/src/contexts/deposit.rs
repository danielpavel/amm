use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        mint_to, transfer_checked, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::state::Config;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    maker: Signer<'info>,

    mint_x: InterfaceAccount<'info, Mint>,
    mint_y: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = maker,
    )]
    maker_ata_x: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = maker,
    )]
    maker_ata_y: Box<InterfaceAccount<'info, TokenAccount>>,

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
        init_if_needed,
        payer = maker,
        associated_token::mint = mint_lp,
        associated_token::authority = maker,
    )]
    maker_lp_ata: Box<InterfaceAccount<'info, TokenAccount>>,

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

impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, max_x: u64, max_y: u64) -> Result<()> {
        let lp_supply = self.mint_lp.supply;
        let amount_vault_x = self.vault_x.amount;
        let amount_vault_y = self.vault_y.amount;

        let (amount_x, amount_y) =
            match lp_supply == 0 && amount_vault_x == 0 && amount_vault_y == 0 {
                true => (max_x, max_y),
                false => {
                    let ratio = amount_vault_x
                        .checked_div(amount_vault_y)
                        .ok_or(ProgramError::ArithmeticOverflow)?;

                    let dx = max_x;
                    let dy = dx
                        .checked_div(ratio)
                        .ok_or(ProgramError::ArithmeticOverflow)?;

                    let (amount_x, amount_y) = match dy <= max_y {
                        true => (dx, dy),
                        false => {
                            let dy = max_y;
                            let dx = dy
                                .checked_div(ratio)
                                .ok_or(ProgramError::ArithmeticOverflow)?;
                            (dx, dy)
                        }
                    };

                    (amount_x, amount_y)
                }
            };

        self.deposit_tokens(amount_x, true)?;
        self.deposit_tokens(amount_y, false)?;

        self.mint_lp_tokens(amount_x, amount_y)
    }

    fn deposit_tokens(&mut self, amount: u64, is_x: bool) -> Result<()> {
        let (from, to, mint) = match is_x {
            true => (
                self.maker_ata_x.to_account_info(),
                self.vault_x.to_account_info(),
                self.mint_x.clone(),
            ),
            false => (
                self.maker_ata_y.to_account_info(),
                self.vault_y.to_account_info(),
                self.mint_y.clone(),
            ),
        };

        let cpi_accounts = TransferChecked {
            mint: mint.to_account_info(),
            from,
            to,
            authority: self.maker.to_account_info(),
        };

        let cpi_context = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);

        transfer_checked(cpi_context, amount, mint.decimals)
    }

    pub fn mint_lp_tokens(&mut self, amount_x: u64, amount_y: u64) -> Result<()> {
        msg!("Minting LP tokens");

        let seed = self.config.seed.to_le_bytes();
        let bump = [self.config.bump];
        let signer_seeds = [&[
            b"amm",
            self.mint_x.to_account_info().key.as_ref(),
            self.mint_y.to_account_info().key.as_ref(),
            seed.as_ref(),
            &bump,
        ][..]];

        let amount = amount_x
            .checked_mul(amount_y)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        let accounts = MintTo {
            mint: self.mint_lp.to_account_info(),
            to: self.maker_lp_ata.to_account_info(),
            authority: self.config.to_account_info(),
        };

        let cpi_context = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            accounts,
            &signer_seeds,
        );

        mint_to(cpi_context, amount)
    }
}
