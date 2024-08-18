use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    signer: Signer<'info>,
}
