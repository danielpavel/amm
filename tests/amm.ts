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

  let decimals = 6;

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
      10000,
      initializer.publicKey
    );
    const { mint: mintY_, ata: ataY_ } = await createAndMint(
      provider,
      1000,
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
    const amountX = 100 * 10 ** decimals;
    const amountY = 10 * 10 ** decimals;

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

    // Get initial balances
    let initialMakerAtaXAmount = await connection.getTokenAccountBalance(
      initializerAtaX
    );
    let initialMakerAtaYAmount = await connection.getTokenAccountBalance(
      initializerAtaY
    );

    // console.log(
    //   "initialMakerAtaXAmount",
    //   initialMakerAtaXAmount.value.uiAmount
    // );
    // console.log(
    //   "initialMakerAtaYAmount",
    //   initialMakerAtaYAmount.value.uiAmount
    // );

    try {
      const tx = await program.methods
        .deposit(new anchor.BN(amountX), new anchor.BN(amountY))
        .signers([initializer])
        .accounts(accounts)
        .rpc();

      console.log("Your transaction signature", tx);
    } catch (e) {
      if (e instanceof web3.SendTransactionError) {
        console.log(e);
      }
    }

    const vaultXBalance = await connection.getTokenAccountBalance(vaultX);
    const vaultYBalance = await connection.getTokenAccountBalance(vaultY);

    // console.log("vaultXBalance", vaultXBalance.value.uiAmount);
    // console.log("vaultYBalance", vaultYBalance.value.uiAmount);

    // It's initial deposit so check that amount deposited is the amount in the vaults
    expect(vaultXBalance.value.amount).to.eql(amountX.toString());
    expect(vaultYBalance.value.amount).to.eql(amountY.toString());

    // check amounts have been debited from the maker's accounts
    const makerAtaXAmount = await connection.getTokenAccountBalance(
      initializerAtaX
    );
    const makerAtaYAmount = await connection.getTokenAccountBalance(
      initializerAtaY
    );

    // console.log("makerAtaXBalance", makerAtaXAmount.value.uiAmount);
    // console.log("makerAtaYBalance", makerAtaYAmount.value.uiAmount);

    expect(Number(makerAtaXAmount.value.amount)).eq(
      Number(initialMakerAtaXAmount.value.amount) - amountX
    );
    expect(Number(makerAtaYAmount.value.amount)).eq(
      Number(initialMakerAtaYAmount.value.amount) - amountY
    );

    // check amount of LP tokens
    const makerLpAmount = await connection.getTokenAccountBalance(makerLpAta);
    const makerLpAmountBN = new anchor.BN(makerLpAmount.value.amount);
    const expectedLpAmountBN = new anchor.BN(amountY * amountX);

    expect(makerLpAmountBN).to.deep.eq(expectedLpAmountBN);
  });

  it("deposit again - keep ratio", async () => {
    const amountX = 50 * 10 ** decimals;
    const amountY = 60 * 10 ** decimals;

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

    // Get initial balances
    const initialVaultXAmount = await connection.getTokenAccountBalance(vaultX);
    const initialVaultYAmount = await connection.getTokenAccountBalance(vaultY);

    const ratio =
      initialVaultXAmount.value.uiAmount / initialVaultYAmount.value.uiAmount;

    try {
      const tx = await program.methods
        .deposit(new anchor.BN(amountX), new anchor.BN(amountY))
        .signers([initializer])
        .accounts(accounts)
        .rpc();

      console.log("Your transaction signature", tx);
    } catch (e) {
      if (e instanceof web3.SendTransactionError) {
        console.log(e);
      }
    }

    const vaultXBalance = await connection.getTokenAccountBalance(vaultX);
    const vaultYBalance = await connection.getTokenAccountBalance(vaultY);

    // console.log("VaultXBalance:", vaultXBalance.value.uiAmount);
    // console.log("VaultYBalance:", vaultYBalance.value.uiAmount);

    // Check vault balances have increased and kept the ratio
    const newRatio =
      vaultXBalance.value.uiAmount / vaultYBalance.value.uiAmount;

    expect(newRatio).to.eql(ratio);
  });
});
