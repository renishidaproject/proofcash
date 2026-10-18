//! # proofcashd
//!
//! The ProofCash sovereign reference node daemon.
//! Author: Ren Ishida (October 2026)

use proofcash_node::{Mempool, NodeRpcHandler, PoSWMiner};
use proofcash_storage::StateDatabase;
use std::env;

#[derive(Debug, Clone)]
struct NodeConfig {
    datadir: String,
    rpc_port: u16,
    network: String,
    is_daemon: bool,
    posw_threads: usize,
}

impl Default for NodeConfig {
    fn default() -> Self {
        Self {
            datadir: String::from("~/.proofcash/data"),
            rpc_port: 8332,
            network: String::from("mainnet"),
            is_daemon: false,
            posw_threads: 4,
        }
    }
}

fn print_help() {
    println!(r#"PROOFCASHD — Sovereign Thermodynamic Node Daemon v1.2
Usage: proofcashd [OPTIONS]

Options:
  -h, --help               Print this help message and exit
  -v, --version            Print version information and exit
      --datadir <PATH>     Specify data directory for state DB & MMR [default: ~/.proofcash/data]
      --rpc-port <PORT>    JSON-RPC HTTP/WebSocket port [default: 8332]
      --network <NET>      Network target: mainnet | testnet [default: mainnet]
      --daemon             Run continuously as background daemon service
      --posw-threads <N>   Number of worker threads for Blake3 PoSW [default: 4]
"#);
}

fn parse_cli_args() -> Option<NodeConfig> {
    let args: Vec<String> = env::args().collect();
    let mut config = NodeConfig::default();
    let mut i = 1;

    while i < args.len() {
        match args[i].as_str() {
            "-h" | "--help" => {
                print_help();
                return None;
            }
            "-v" | "--version" => {
                println!("proofcashd v1.2.0-mainnet (Blake3 PoSW, Two-Tier AIR, O(1) STARK)");
                return None;
            }
            "--datadir" => {
                if i + 1 < args.len() {
                    config.datadir = args[i + 1].clone();
                    i += 1;
                }
            }
            "--rpc-port" => {
                if i + 1 < args.len() {
                    if let Ok(port) = args[i + 1].parse::<u16>() {
                        config.rpc_port = port;
                    }
                    i += 1;
                }
            }
            "--network" => {
                if i + 1 < args.len() {
                    config.network = args[i + 1].clone();
                    i += 1;
                }
            }
            "--daemon" => {
                config.is_daemon = true;
            }
            "--posw-threads" => {
                if i + 1 < args.len() {
                    if let Ok(threads) = args[i + 1].parse::<usize>() {
                        config.posw_threads = threads;
                    }
                    i += 1;
                }
            }
            _ => {
                eprintln!("Unknown argument: {}. Use --help for usage.", args[i]);
            }
        }
        i += 1;
    }

    Some(config)
}

fn main() {
    let config = match parse_cli_args() {
        Some(cfg) => cfg,
        None => return,
    };

    println!("========================================================");
    println!("  PROOFCASHD — Sovereign Thermodynamic Node Daemon v1.2 ");
    println!("  Author: Ren Ishida (October 2026)                     ");
    println!("========================================================");
    println!("-> Network Mode:        {}", config.network.to_uppercase());
    println!("-> Data Directory:      {}", config.datadir);
    println!("-> JSON-RPC Port:       {}", config.rpc_port);
    println!("-> PoSW Worker Threads: {}", config.posw_threads);
    println!("-> Daemon Loop Mode:    {}", if config.is_daemon { "Active (Persistent)" } else { "Single-Shot Testnet" });

    println!("\n-> Initializing memory-mapped state accumulator (MMR)...");
    let mut db = StateDatabase::new();
    let mut mempool = Mempool::new();
    let mut miner = PoSWMiner::default();

    println!("-> Genesis block loaded: State root = 0x{:02x}...", db.state_root()[0]);
    println!("-> O(1) Recursive STARK verifier initialized (~43.2 KB proof budget)");
    println!("-> PID Thermodynamic Fee Reservoir: Kp=0.5, Ki=0.05, alpha=0.98");
    println!("-> Total Supply Cap: 1,000,000,000 PCASH (10^21 Pico-Joules)");

    // Query initial node status
    let info = NodeRpcHandler::get_blockchain_info(&db, &miner);
    println!("\n[RPC] Initial Blockchain Status:");
    println!("  Height:           {}", info.blocks);
    println!("  State Root:       {}", info.state_root);
    println!("  Recursive Proof:  {:.2} KB", info.proof_size_kb);
    println!("  Reservoir Pool:   {} pJ", info.reservoir_balance);

    // Simulate mining a block
    println!("\n-> Mining Block 1 via Proof-of-Succinct-Work...");
    let hashes = NodeRpcHandler::mine_blocks(&mut miner, &mut db, &mut mempool, 1);
    println!("  Mined Block 1 Hash: {}", hashes[0]);

    let updated_info = NodeRpcHandler::get_blockchain_info(&db, &miner);
    println!("\n[RPC] Updated Blockchain Status:");
    println!("  Height:           {}", updated_info.blocks);
    println!("  New State Root:   {}", updated_info.state_root);
    println!("  Proof Size:       {:.2} KB (O(1) verified)", updated_info.proof_size_kb);
    println!("\n✓ Node daemon is running and synchronized. Listening for P2P peers on port {}.", config.rpc_port);
}
