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

  let mintLp: web3.PublicKey;
  let mintLpBump: number;

  let config: web3.PublicKey;
  let configBump: number;

  let vaultX: web3.PublicKey;
  let vaultY: web3.PublicKey;

  let seed = generateRandomU64Seed();

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
      1000,
      initializer.publicKey
    );
    const { mint: mintY_, ata: ataY_ } = await createAndMint(
      provider,
      100,
      initializer.publicKey
    );

    mintX = mintX_.publicKey;
    mintY = mintY_.publicKey;
    initializerAtaX = ataX_;
    initializerAtaY = ataY_;
  });

  it("Is initialized!", async () => {
    const fee = 100; // 1% in basis points

    const [config_, configBump_] = web3.PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("amm"),
        mintX.toBuffer(),
        mintY.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [mintLp_, mintLpBump_] = web3.PublicKey.findProgramAddressSync(
      [anchor.utils.bytes.utf8.encode("mint"), config_.toBuffer()],
      program.programId
    );

    mintLp = mintLp_;
    mintLpBump = mintLpBump_;
    config = config_;
    configBump = configBump_;

    // console.log("config:", config.toBase58());
    // console.log("mintLp:", mintLp.toBase58());

    vaultX = getAssociatedTokenAddressSync(mintX, config, true);
    vaultY = getAssociatedTokenAddressSync(mintY, config, true);

    // console.log("vaultX:", vaultX.toBase58());
    // console.log("vaultY:", vaultY.toBase58());

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

  it("deposit", async () => {
    const amountX = 100;
    const amountY = 10;

    const makerLpAta = getAssociatedTokenAddressSync(
      mintLp,
      initializer.publicKey,
      true
    );

    const accounts = {
      maker: initializer.publicKey,
      mintX,
      mintY,
      makerAtaX: initializerAtaX,
      makerAtaY: initializerAtaY,
      mintLp,
      vaultX,
      vaultY,
      makerLpAta,
      config, // config account
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    try {
      const tx = await program.methods
        .deposit(
          new anchor.BN(amountX),
          new anchor.BN(amountY),
          new anchor.BN(amountX + 1),
          new anchor.BN(amountY + 1)
        )
        .signers([initializer])
        .accounts(accounts)
        .rpc();

      console.log("Your transaction signature", tx);
    } catch (e) {
      if (e instanceof web3.SendTransactionError) {
        console.log(e);
      }
    }
  });
});
