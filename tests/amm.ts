import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { createAndMint, generateRandomU64Seed } from "./utils/utils";

import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { expect } from "chai";

describe("amm", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Amm as Program<Amm>;
  const provider = anchor.getProvider();
  const connection = provider.connection;

  const initializer = web3.Keypair.generate();

  console.log("initializer", initializer.publicKey.toBase58());

  let mintX: web3.PublicKey;
  let mintY: web3.PublicKey;
  let initializerAtaX: web3.PublicKey;
  let initializerAtaY: web3.PublicKey;

  before("Airdrop and Initialize Mints / ATAs", async () => {
    await anchor
      .getProvider()
      .connection.requestAirdrop(
        initializer.publicKey,
        10 * anchor.web3.LAMPORTS_PER_SOL
      );

    // Create two mints.
    const { mint: mintX_, ata: ataX_ } = await createAndMint(
      provider,
      100,
      initializer.publicKey
    );
    const { mint: mintY_, ata: ataY_ } = await createAndMint(
      provider,
      10,
      initializer.publicKey
    );

    mintX = mintX_.publicKey;
    mintY = mintY_.publicKey;
    initializerAtaX = ataX_;
    initializerAtaY = ataY_;
  });

  it("Is initialized!", async () => {
    const seed = generateRandomU64Seed();
    const fee = 100; // 1% in basis points

    const [config, configBump] = web3.PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("amm"),
        mintX.toBuffer(),
        mintY.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [mintLp, mintLpBump] = web3.PublicKey.findProgramAddressSync(
      [anchor.utils.bytes.utf8.encode("mint"), config.toBuffer()],
      program.programId
    );

    let vaultX = getAssociatedTokenAddressSync(mintX, config, true);
    let vaultY = getAssociatedTokenAddressSync(mintY, config, true);

    const accounts = {
      signer: initializer.publicKey,
      mintX,
      mintY,
      config,
      mintLp,
      vaultX,
      vaultY,
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    // Add your test here.
    const tx = await program.methods
      .initialize(new anchor.BN(seed), fee)
      .accounts(accounts)
      .signers([initializer])
      .rpc();

    const configAccount = await program.account.config.fetch(config);

    expect(configAccount.mintY).to.eql(mintY);
    expect(configAccount.mintX).to.eql(mintX);
    expect(configAccount.seed).to.eql(seed);
    expect(configAccount.fee).to.eql(fee);
    expect(configAccount.bump).to.eql(configBump);
    expect(configAccount.lpBump).to.eql(mintLpBump);

    console.log("Your transaction signature", tx);
  });
});
