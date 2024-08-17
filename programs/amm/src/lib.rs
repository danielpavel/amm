use anchor_lang::prelude::*;

declare_id!("DocSNPbey9uJ5W9817nfc5wGyDhrrXFJ4ujK76a7AUCY");

#[program]
pub mod amm {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
