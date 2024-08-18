use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    signer: Signer<'info>,
}
