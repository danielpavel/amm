use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    signer: Signer<'info>,
}
