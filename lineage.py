"""
DataWorks 血缘影子中枢 - Python 图谱分析 SDK

用法:
    from lineage import LineageHub

    hub = LineageHub("graph.json")

    # 1. 所有画布名称
    names = hub.list_canvases()

    # 2. 画布的数据流转结构
    canvas = hub.get_canvas("默认画布")

    # 3. 直接上游
    upstream = hub.get_upstream("dw_report_gen", "默认画布")

    # 4. 直接下游
    downstream = hub.get_downstream("dw_user_etl", "默认画布")

    # 5. 两节点间完整链路
    chain = hub.get_chain("默认画布", "dw_user_etl", "dw_report_gen")
"""

import json
from collections import deque
from typing import Optional


class LineageHub:
    def __init__(self, graph_path: str = "graph.json"):
        with open(graph_path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        # 兼容旧格式（无 canvases 字段）
        if "canvases" not in raw:
            raw = {
                "canvases": [{
                    "id": "canvas_default",
                    "name": "默认画布",
                    "nodes": raw.get("nodes", []),
                    "edges": raw.get("edges", [])
                }],
                "activeCanvasId": "canvas_default"
            }

        self._raw = raw
        self._canvases: dict[str, dict] = {}
        self._name_to_id: dict[str, str] = {}

        for c in raw["canvases"]:
            self._canvases[c["id"]] = c
            self._name_to_id[c["name"]] = c["id"]

    # ── 内部辅助 ──────────────────────────────────────

    def _get_canvas(self, name_or_id: str) -> dict:
        """通过名称或 ID 定位画布"""
        cid = self._name_to_id.get(name_or_id, name_or_id)
        canvas = self._canvases.get(cid)
        if canvas is None:
            raise KeyError(f"画布不存在: {name_or_id}")
        return canvas

    @staticmethod
    def _build_adj(canvas: dict, direction: str = "downstream"):
        """构建邻接表。direction: 'downstream' | 'upstream'"""
        adj: dict[str, list[str]] = {}
        for n in canvas["nodes"]:
            adj[n["id"]] = []

        for e in canvas["edges"]:
            src, tgt = e["source"], e["target"]
            if direction == "downstream":
                if src in adj:
                    adj[src].append(tgt)
            else:
                if tgt in adj:
                    adj[tgt].append(src)

        return adj

    @staticmethod
    def _node_map(canvas: dict) -> dict[str, dict]:
        return {n["id"]: n for n in canvas["nodes"]}

    # ── 公开 API ──────────────────────────────────────

    def list_canvases(self) -> list[dict]:
        """
        返回所有画布的名称和基本信息。

        返回值示例:
            [
                {"name": "默认画布", "id": "canvas_default", "node_count": 4, "edge_count": 3},
                ...
            ]
        """
        result = []
        for c in self._raw["canvases"]:
            result.append({
                "name": c["name"],
                "id": c["id"],
                "node_count": len(c["nodes"]),
                "edge_count": len(c["edges"]),
            })
        return result

    def get_canvas(self, name: str) -> dict:
        """
        获取画布的数据流转结构。

        返回值:
            {
                "id": "canvas_default",
                "name": "默认画布",
                "nodes": [...],
                "edges": [...],
                "flows": [   # 数据流转关系
                    {"from": "节点A", "to": "节点B", "label": "..."},
                    ...
                ]
            }
        """
        canvas = self._get_canvas(name)
        nm = self._node_map(canvas)
        flows = []
        for e in canvas["edges"]:
            flows.append({
                "from": nm[e["source"]]["data"]["label"] if e["source"] in nm else e["source"],
                "from_id": e["source"],
                "to": nm[e["target"]]["data"]["label"] if e["target"] in nm else e["target"],
                "to_id": e["target"],
                "label": e.get("label", ""),
                "lineStyle": (e.get("data", {}) or {}).get("lineStyle", e.get("lineStyle", "solid"))
            })
        return {
            "id": canvas["id"],
            "name": canvas["name"],
            "nodes": canvas["nodes"],
            "edges": canvas["edges"],
            "flows": flows
        }

    def get_upstream(self, node_id: str, canvas_name: str) -> list[dict]:
        """
        获取节点的直接上游。

        返回值:
            [
                {"id": "dw_001", "label": "订单同步任务", "edge_label": ""},
                ...
            ]
        """
        canvas = self._get_canvas(canvas_name)
        nm = self._node_map(canvas)
        result = []
        for e in canvas["edges"]:
            if e["target"] == node_id:
                src = e["source"]
                result.append({
                    "id": src,
                    "label": nm[src]["data"]["label"] if src in nm else src,
                    "comment": nm[src]["data"].get("comment", "") if src in nm else "",
                    "edge_label": e.get("label", ""),
                    "lineStyle": (e.get("data", {}) or {}).get("lineStyle", e.get("lineStyle", "solid"))
                })
        return result

    def get_downstream(self, node_id: str, canvas_name: str) -> list[dict]:
        """
        获取节点的直接下游。

        返回值:
            [
                {"id": "dw_002", "label": "日报生成任务", "edge_label": ""},
                ...
            ]
        """
        canvas = self._get_canvas(canvas_name)
        nm = self._node_map(canvas)
        result = []
        for e in canvas["edges"]:
            if e["source"] == node_id:
                tgt = e["target"]
                result.append({
                    "id": tgt,
                    "label": nm[tgt]["data"]["label"] if tgt in nm else tgt,
                    "comment": nm[tgt]["data"].get("comment", "") if tgt in nm else "",
                    "edge_label": e.get("label", ""),
                    "lineStyle": (e.get("data", {}) or {}).get("lineStyle", e.get("lineStyle", "solid"))
                })
        return result

    def get_chain(self, canvas_name: str, start_id: str, end_id: str) -> dict:
        """
        获取从 start_id 到 end_id 的完整链路信息。

        内部逻辑:
        1. BFS 从 start 正向遍历，找出所有能到达的下游节点
        2. BFS 从 end 反向遍历，找出所有能到达 end 的上游节点
        3. 取交集 → 得到路径上的所有节点
        4. 重建这些节点之间的边关系，形成链路

        返回值:
            {
                "start": {"id": "...", "label": "..."},
                "end": {"id": "...", "label": "..."},
                "nodes": [...],     # 路径上的所有节点
                "edges": [...],     # 路径上的所有边
                "chain_text": "节点A → 节点B → 节点C"
            }
        """
        canvas = self._get_canvas(canvas_name)
        nm = self._node_map(canvas)
        downstream_adj = self._build_adj(canvas, "downstream")
        upstream_adj = self._build_adj(canvas, "upstream")

        # BFS 从 start 正向找所有下游
        reachable_from_start = self._bfs_set(start_id, downstream_adj)

        # BFS 从 end 反向找所有上游
        can_reach_end = self._bfs_set(end_id, upstream_adj)

        # 交集 = 路径上的节点（含 start 和 end）
        path_nodes = reachable_from_start & can_reach_end
        path_nodes.add(start_id)
        path_nodes.add(end_id)

        # 筛选路径上的边（两端都在 path_nodes 中）
        path_edges = []
        for e in canvas["edges"]:
            if e["source"] in path_nodes and e["target"] in path_nodes:
                # 只保留从 start 可到达且能到达 end 的边
                if e["source"] in reachable_from_start and e["target"] in reachable_from_start:
                    if e["target"] in can_reach_end:
                        path_edges.append(e)

        # 过滤：只保留 start → end 方向上的边
        valid_edges = []
        for e in path_edges:
            if e["source"] in reachable_from_start and e["target"] in can_reach_end:
                valid_edges.append(e)

        # 拓扑排序生成 chain_text
        chain_text = self._build_chain_text(start_id, end_id, valid_edges, nm)

        return {
            "start": {"id": start_id, "label": nm[start_id]["data"]["label"] if start_id in nm else start_id},
            "end": {"id": end_id, "label": nm[end_id]["data"]["label"] if end_id in nm else end_id},
            "nodes": [n for n in canvas["nodes"] if n["id"] in path_nodes],
            "edges": valid_edges,
            "chain_text": chain_text
        }

    # ── Mermaid 格式化（供 LLM 消费）─────────────────

    _LEGEND = (
        "### 📊 数仓血缘图例与排查规则声明：\n"
        "1. **实线箭头 (-->) 代表【强依赖 / 数据流依赖】**：\n"
        "   - **业务含义**：上游任务必须成功运行并产出数据，下游任务才能正常读取和计算。\n"
        "   - **排查指导**：如果下游节点数据不对或缺失，大概率是直接强依赖的上游节点（实线指向源）执行异常或数据断流。\n"
        "   - **补数指导**：上游数据重跑后，必须依次顺着实线箭头同步重跑所有下游节点。\n"
        "2. **虚线箭头 (-.->) 代表【弱依赖 / 跨链关联 / 未配置调度】**：\n"
        "   - **业务含义**：节点间存在逻辑上的业务关联或外部API触发，但在 DataWorks 内部【未配置底层的调度依赖关系】。下游不会因为上游的启动而自动触发。\n"
        "   - **排查指导**：当下游数据缺失时，如果是虚线连接的上游，需优先排查该弱依赖的触发器、中间表、或者外部同步任务是否断开。\n"
        "   - **补数指导**：重跑虚线箭头的上游节点时，下游**不会**自动联动，通常需要数仓开发人员手动去补下游节点的数据。\n"
    )

    def canvas_to_mermaid(self, name: str) -> str:
        """
        将画布的全部 nodes / edges 转换为 Mermaid graph TD 格式，
        适合直接投喂给大模型（LLM）作为上下文。

        输出示例:
            ```mermaid
            graph TD
                dw_001["订单同步任务"]
                dw_002["日报生成任务"]
                dw_001 --> dw_002
                %% dw_001(订单同步任务): 上游依赖 DWD 层
            ```
        """
        canvas = self._get_canvas(name)
        lines = ["```mermaid", "graph TD"]

        # 节点定义
        for n in canvas["nodes"]:
            label = self._escape_mermaid(n["data"]["label"])
            lines.append(f"    {n['id']}[\"{label}\"]")

        # 注释：携带业务上下文
        for n in canvas["nodes"]:
            comment = n["data"].get("comment", "").strip()
            if comment:
                label = n["data"]["label"]
                safe_comment = self._escape_mermaid(comment)
                lines.append(f"    %% {n['id']}({label}): {safe_comment}")

        # 连线
        for e in canvas["edges"]:
            line_style = (e.get("data", {}) or {}).get("lineStyle", "solid")
            arrow = "-.->" if line_style == "dashed" else "-->"
            lines.append(f"    {e['source']} {arrow} {e['target']}")

        lines.append("```")
        return self._LEGEND + "\n" + "\n".join(lines)

    def chain_to_mermaid(self, canvas_name: str, start_id: str, end_id: str) -> str:
        """
        将两点间链路转换为 Mermaid graph TD 格式（仅含路径上的节点和边），
        适合直接投喂给大模型（LLM）作为上下文。

        输出示例:
            ```mermaid
            graph TD
                dw_001["订单同步任务"]
                dw_002["日报生成任务"]
                dw_001 -.-> dw_002
                %% dw_001(订单同步任务): 上游依赖 DWD 层
            ```

            **链路说明**: 订单同步任务 → 日报生成任务
        """
        chain = self.get_chain(canvas_name, start_id, end_id)
        lines = ["```mermaid", "graph TD"]

        # 节点定义
        for n in chain["nodes"]:
            label = self._escape_mermaid(n["data"]["label"])
            lines.append(f"    {n['id']}[\"{label}\"]")

        # 注释
        for n in chain["nodes"]:
            comment = n["data"].get("comment", "").strip()
            if comment:
                label = n["data"]["label"]
                safe_comment = self._escape_mermaid(comment)
                lines.append(f"    %% {n['id']}({label}): {safe_comment}")

        # 连线
        for e in chain["edges"]:
            line_style = (e.get("data", {}) or {}).get("lineStyle", "solid")
            arrow = "-.->" if line_style == "dashed" else "-->"
            lines.append(f"    {e['source']} {arrow} {e['target']}")

        lines.append("```")

        if chain["chain_text"]:
            lines.append("")
            lines.append(f"**链路说明**: {chain['chain_text']}")

        return self._LEGEND + "\n" + "\n".join(lines)

    @staticmethod
    def _escape_mermaid(text: str) -> str:
        """转义 Mermaid 中的特殊字符"""
        return text.replace('"', "'").replace("\n", " ").replace("\r", "")

    # ── 内部方法 ──────────────────────────────────────

    @staticmethod
    def _bfs_set(start: str, adj: dict[str, list[str]]) -> set[str]:
        """BFS 返回从 start 出发能到达的所有节点（含 start）"""
        visited = {start}
        queue = deque([start])
        while queue:
            cur = queue.popleft()
            for nb in adj.get(cur, []):
                if nb not in visited:
                    visited.add(nb)
                    queue.append(nb)
        return visited

    @staticmethod
    def _build_chain_text(start_id, end_id, edges, node_map) -> str:
        """根据边和节点生成链路文本，如 'A → B → C'"""
        if not edges:
            # 尝试直接用 BFS 找路径
            return ""

        # 构建邻接 + 拓扑排序简化路径
        adj: dict[str, list[str]] = {}
        in_degree: dict[str, int] = {}
        all_nodes = set()
        for e in edges:
            all_nodes.add(e["source"])
            all_nodes.add(e["target"])

        for n in all_nodes:
            adj[n] = []
            in_degree[n] = 0

        for e in edges:
            adj[e["source"]].append(e["target"])
            in_degree[e["target"]] += 1

        # Kahn 拓扑排序（仅 path 内节点）
        queue = deque([n for n in all_nodes if in_degree[n] == 0])
        topo = []
        while queue:
            cur = queue.popleft()
            topo.append(cur)
            for nb in adj[cur]:
                in_degree[nb] -= 1
                if in_degree[nb] == 0:
                    queue.append(nb)

        # 从 topo 中提取 start → end 之间的节点
        try:
            si = topo.index(start_id)
            ei = topo.index(end_id)
            chain_ids = topo[si:ei + 1]
        except ValueError:
            chain_ids = [start_id, end_id]

        # 生成文本
        parts = []
        for nid in chain_ids:
            label = node_map[nid]["data"]["label"] if nid in node_map else nid
            parts.append(label)
        return " → ".join(parts)


# ── 便捷函数（无需实例化）──────────────────────────

_default_hub: Optional[LineageHub] = None


def _get_hub(path: str = "graph.json") -> LineageHub:
    global _default_hub
    if _default_hub is None or _default_hub._raw is None:
        _default_hub = LineageHub(path)
    return _default_hub


def list_canvases(path: str = "graph.json") -> list[dict]:
    """返回所有画布名称"""
    return _get_hub(path).list_canvases()


def get_canvas(name: str, path: str = "graph.json") -> dict:
    """获取画布数据流转结构"""
    return _get_hub(path).get_canvas(name)


def get_upstream(node_id: str, canvas_name: str, path: str = "graph.json") -> list[dict]:
    """获取节点的直接上游"""
    return _get_hub(path).get_upstream(node_id, canvas_name)


def get_downstream(node_id: str, canvas_name: str, path: str = "graph.json") -> list[dict]:
    """获取节点的直接下游"""
    return _get_hub(path).get_downstream(node_id, canvas_name)


def get_chain(canvas_name: str, start_id: str, end_id: str, path: str = "graph.json") -> dict:
    """获取两个节点之间的完整链路"""
    return _get_hub(path).get_chain(canvas_name, start_id, end_id)


def canvas_to_mermaid(name: str, path: str = "graph.json") -> str:
    """画布 → Mermaid graph TD（供 LLM 消费）"""
    return _get_hub(path).canvas_to_mermaid(name)


def chain_to_mermaid(canvas_name: str, start_id: str, end_id: str, path: str = "graph.json") -> str:
    """链路 → Mermaid graph TD（供 LLM 消费）"""
    return _get_hub(path).chain_to_mermaid(canvas_name, start_id, end_id)


# ── 命令行测试入口 ──────────────────────────────────

if __name__ == "__main__":
    import sys

    hub_path = sys.argv[1] if len(sys.argv) > 1 else "graph.json"
    hub = LineageHub(hub_path)

    print("=" * 60)
    print("画布列表")
    print("=" * 60)
    for c in hub.list_canvases():
        print(f"  {c['name']}  ({c['node_count']} 节点, {c['edge_count']} 连线)")

    # 取第一个画布做演示
    canvases = hub.list_canvases()
    if not canvases:
        print("(无画布)")
        sys.exit(0)

    demo_name = canvases[0]["name"]

    # ── 方法 2: Mermaid 全画布 ──
    print(f"\n{'=' * 60}")
    print(f"画布「{demo_name}」→ Mermaid (供 LLM 消费)")
    print("=" * 60)
    print(hub.canvas_to_mermaid(demo_name))

    # ── JSON 流转结构 ──
    canvas = hub.get_canvas(demo_name)
    print(f"\n画布「{demo_name}」数据流转 (JSON):")
    for f in canvas["flows"]:
        label = f" [{f['label']}]" if f["label"] else ""
        style = "虚线" if f["lineStyle"] == "dashed" else "实线"
        print(f"  {f['from']} → {f['to']}{label}  ({style})")

    # ── 上下游 ──
    if canvas["nodes"]:
        n0 = canvas["nodes"][0]["id"]
        print(f"\n节点 [{n0}] 直接下游:")
        for d in hub.get_downstream(n0, demo_name):
            label = f" [{d['edge_label']}]" if d["edge_label"] else ""
            print(f"  → {d['label']}{label}")

    # ── 方法 5: Mermaid 链路 ──
    if len(canvas["nodes"]) >= 2:
        n1 = canvas["nodes"][0]["id"]
        n2 = canvas["nodes"][-1]["id"]
        if n1 != n2:
            print(f"\n{'=' * 60}")
            print(f"链路 [{n1}] → [{n2}] → Mermaid (供 LLM 消费)")
            print("=" * 60)
            print(hub.chain_to_mermaid(demo_name, n1, n2))
