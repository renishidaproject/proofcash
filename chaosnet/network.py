"""
Chaosnet P2P Mesh Network & Partition Simulator
Author: Ren Ishida (October 2026)
"""

from typing import Dict, List, Set
from .node_instance import NodeInstance

class P2PNetworkMesh:
    def __init__(self):
        self.nodes: Dict[str, NodeInstance] = {}
        # Partitions: by default, all nodes belong to partition 0
        self.partition_map: Dict[str, int] = {}
        self.latency_ms: float = 5.0

    def register_node(self, node: NodeInstance, partition_id: int = 0):
        self.nodes[node.node_id] = node
        self.partition_map[node.node_id] = partition_id

    def partition(self, group_a: List[str], group_b: List[str]):
        """Splits the network into two mutually unreachable partitions."""
        for nid in group_a:
            self.partition_map[nid] = 1
        for nid in group_b:
            self.partition_map[nid] = 2

    def heal(self):
        """Restores full network connectivity across all nodes."""
        for nid in self.nodes:
            self.partition_map[nid] = 0

    def can_communicate(self, src: str, dst: str) -> bool:
        return self.partition_map.get(src, 0) == self.partition_map.get(dst, 0)

    def broadcast_transaction(self, sender_id: str, tx: dict) -> Dict[str, str]:
        results = {}
        for nid, node in self.nodes.items():
            if nid != sender_id and self.can_communicate(sender_id, nid):
                ok, msg = node.receive_transaction(tx)
                results[nid] = msg
        return results

    def broadcast_block(self, miner_id: str, block: dict, txs: List[dict] = None) -> Dict[str, str]:
        results = {}
        for nid, node in self.nodes.items():
            if nid != miner_id and self.can_communicate(miner_id, nid):
                ok, msg = node.receive_block(block, txs)
                results[nid] = msg
        return results

    def sync_nodes(self, leader_id: str, follower_ids: List[str]):
        """Fast O(1) sync: followers download the succinct recursive proof and root from leader."""
        leader = self.nodes[leader_id]
        if not leader.headers:
            return
        tip_header = leader.headers[-1]
        for fid in follower_ids:
            follower = self.nodes[fid]
            follower.headers = list(leader.headers)
            follower.cumulative_work = leader.cumulative_work
            follower.mmr_nodes = list(leader.mmr_nodes)
            follower.spent_nullifiers = set(leader.spent_nullifiers)
