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
import time
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

        self._graph_path = graph_path
        self._raw = raw
        self._canvases: dict[str, dict] = {}
        self._name_to_id: dict[str, str] = {}
        self._node_offset = 0

        for c in raw["canvases"]:
            self._canvases[c["id"]] = c
            self._name_to_id[c["name"]] = c["id"]

    def _save(self):
        """将当前内存状态写回 graph.json"""
        with open(self._graph_path, "w", encoding="utf-8") as f:
            json.dump(self._raw, f, ensure_ascii=False, indent=2)

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
                "mermaid": "```mermaid\\ngraph TD\\n    ..."
            }
        """
        canvas = self._get_canvas(name)
        return {
            "id": canvas["id"],
            "name": canvas["name"],
            "nodes": canvas["nodes"],
            "edges": canvas["edges"],
            "mermaid": self.canvas_to_mermaid(name)
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
                "nodes": [...],
                "edges": [...],
                "mermaid": "```mermaid\\ngraph TD\\n    ..."
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

        path_nodes_list = [n for n in canvas["nodes"] if n["id"] in path_nodes]

        return {
            "start": {"id": start_id, "label": nm[start_id]["data"]["label"] if start_id in nm else start_id},
            "end": {"id": end_id, "label": nm[end_id]["data"]["label"] if end_id in nm else end_id},
            "nodes": path_nodes_list,
            "edges": valid_edges,
            "mermaid": self._build_mermaid(path_nodes_list, valid_edges)
        }

    # ── 写图 API ─────────────────────────────────────

    @staticmethod
    def _node_width(node: dict) -> float:
        return node.get("measured", {}).get("width", 200)

    @staticmethod
    def _node_height(node: dict) -> float:
        return node.get("measured", {}).get("height", 80)

    def add_node(self, canvas_name: str, node_name: str, *,
                 node_type: str = "custom",
                 node_comment: str = "",
                 node_id: str = "",
                 position: Optional[dict] = None) -> dict:
        """
        向指定画布添加一个节点。

        参数:
          canvas_name:  画布名称或 ID
          node_name:    节点名称（画布上显示的文字）
          node_type:    节点类型: "DataWorks"（蓝色）或 "custom"（橙色），默认 "custom"
          node_comment: 备注说明，默认空
          node_id:      自定义 ID，不传则自动生成
          position:     {"x": 100, "y": 200}，不传则触发边缘顺延算法

        返回值:
          {"id": "...", "node_name": "...", "node_type": "...", "node_comment": "...", "position": {...}}
        """
        canvas = self._get_canvas(canvas_name)

        # 校验 ID 唯一性
        if node_id:
            existing_ids = {n["id"] for n in canvas["nodes"]}
            if node_id in existing_ids:
                return {"success": False, "error": f"节点 ID 重复: 画布「{canvas['name']}」中已存在节点 '{node_id}'"}

        # node_type → 内部映射
        if node_type == "DataWorks":
            data_origin = "DataWorks"
            prefix = "dw"
        else:
            data_origin = "自定义"
            prefix = "custom"

        # 生成 ID
        if node_id:
            nid = node_id
        else:
            ts = int(time.time() * 1000)
            nid = f"{prefix}_{ts}_{self._node_offset}"

        # 计算坐标（边缘顺延算法）
        if position:
            x, y = position["x"], position["y"]
        elif not canvas["nodes"]:
            x, y = 200, 200
        else:
            existing = canvas["nodes"]
            right_edge = max(
                n["position"]["x"] + self._node_width(n)
                for n in existing
            )
            rightmost = max(existing, key=lambda n: n["position"]["x"])
            x = right_edge + 60
            y = rightmost["position"]["y"] + self._node_offset * 100

        self._node_offset += 1

        new_node = {
            "id": nid,
            "type": "customNode",
            "data": {
                "label": node_name,
                "origin": data_origin,
                "comment": node_comment
            },
            "position": {"x": x, "y": y},
            "deletable": True
        }

        canvas["nodes"].append(new_node)
        self._save()

        return {
            "success": True,
            "id": nid,
            "node_name": node_name,
            "node_type": node_type,
            "node_comment": node_comment,
            "position": {"x": x, "y": y}
        }

    def delete_node(self, canvas_name: str, node_id: str) -> dict:
        """
        删除指定节点，并级联删除所有关联的边。

        返回值:
          成功: {"success": True, "deleted_node": "...", "deleted_edges": 3}
          失败: {"success": False, "error": "..."}
        """
        canvas = self._get_canvas(canvas_name)

        # 检查节点是否存在
        nm = self._node_map(canvas)
        if node_id not in nm:
            return {"success": False, "error": f"节点不存在: 画布「{canvas['name']}」中没有节点 '{node_id}'"}

        # 级联删除关联边
        before = len(canvas["edges"])
        canvas["edges"] = [e for e in canvas["edges"]
                           if e["source"] != node_id and e["target"] != node_id]
        deleted_edges = before - len(canvas["edges"])

        # 删除节点
        canvas["nodes"] = [n for n in canvas["nodes"] if n["id"] != node_id]
        self._save()

        return {
            "success": True,
            "deleted_node": node_id,
            "deleted_edges": deleted_edges
        }

    def update_node(self, canvas_name: str, node_id: str, *,
                    node_name: str = "",
                    node_type: str = "",
                    node_comment: str = "") -> dict:
        """
        更新指定节点的属性。只传需要修改的字段，不传的保持不变。
        node_id 为定位主键，不可修改。

        返回值:
          成功: {"success": True, "id": "...", "node_name": "...", "node_type": "...", "node_comment": "..."}
          失败: {"success": False, "error": "..."}
        """
        canvas = self._get_canvas(canvas_name)

        # 定位节点
        nm = self._node_map(canvas)
        if node_id not in nm:
            return {"success": False, "error": f"节点不存在: 画布「{canvas['name']}」中没有节点 '{node_id}'"}

        node = nm[node_id]

        # 更新 node_name
        if node_name:
            node["data"]["label"] = node_name

        # 更新 node_type
        if node_type:
            if node_type == "DataWorks":
                node["data"]["origin"] = "DataWorks"
            else:
                node["data"]["origin"] = "自定义"

        # 更新 node_comment（允许置空）
        if node_comment:
            node["data"]["comment"] = node_comment

        self._save()

        return {
            "success": True,
            "id": node_id,
            "node_name": node["data"]["label"],
            "node_type": node_type if node_type else ("DataWorks" if node["data"]["origin"] == "DataWorks" else "custom"),
            "node_comment": node["data"]["comment"]
        }

    def add_edge(self, canvas_name: str, from_node: str, to_node: str, *,
                 edge_type: str = "solid") -> dict:
        """
        在两个节点之间添加一条连线。

        参数:
          canvas_name: 画布名称或 ID
          from_node:   上游节点 ID（数据生产者）
          to_node:     下游节点 ID（数据消费者）
          edge_type:   "solid"（强依赖实线）或 "dashed"（弱依赖虚线），默认 "solid"

        返回值:
          成功: {"success": True, "edge_id": "...", "from_node": "...", "to_node": "...", "edge_type": "..."}
          失败: {"success": False, "error": "..."}
        """
        canvas = self._get_canvas(canvas_name)

        # 校验节点存在
        nm = self._node_map(canvas)
        if from_node not in nm:
            return {"success": False, "error": f"上游节点不存在: 画布「{canvas['name']}」中没有节点 '{from_node}'"}
        if to_node not in nm:
            return {"success": False, "error": f"下游节点不存在: 画布「{canvas['name']}」中没有节点 '{to_node}'"}
        if from_node == to_node:
            return {"success": False, "error": f"不能自连: from_node 和 to_node 都是 '{from_node}'"}

        # 校验唯一性（正方向 + 反方向都不允许）
        for e in canvas["edges"]:
            if e["source"] == from_node and e["target"] == to_node:
                return {"success": False, "error": f"边已存在: {from_node} → {to_node}"}
            if e["source"] == to_node and e["target"] == from_node:
                return {"success": False, "error": f"反方向边已存在: {to_node} → {from_node}，同一对节点只允许一条边"}

        # 生成 edge_id
        ts = int(time.time() * 1000)
        eid = f"e_{ts}"

        new_edge = {
            "id": eid,
            "source": from_node,
            "target": to_node,
            "label": "",
            "data": {"lineStyle": edge_type}
        }

        canvas["edges"].append(new_edge)
        self._save()

        return {
            "success": True,
            "edge_id": eid,
            "from_node": from_node,
            "to_node": to_node,
            "edge_type": edge_type
        }

    def delete_edge(self, canvas_name: str, from_node: str, to_node: str) -> dict:
        """
        删除两个节点之间的连线。

        参数:
          canvas_name: 画布名称或 ID
          from_node:   上游节点 ID
          to_node:     下游节点 ID

        返回值:
          成功: {"success": True, "deleted_edge": "e_xxx"}
          失败: {"success": False, "error": "..."}
        """
        canvas = self._get_canvas(canvas_name)

        for e in canvas["edges"]:
            if e["source"] == from_node and e["target"] == to_node:
                canvas["edges"].remove(e)
                self._save()
                return {"success": True, "deleted_edge": e["id"]}

        return {"success": False, "error": f"边不存在: 画布「{canvas['name']}」中没有边 {from_node} → {to_node}"}

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

    # ── 内部：Mermaid 构建（消除 canvas/chain 重复）────

    @classmethod
    def _build_mermaid(cls, nodes: list, edges: list) -> str:
        lines = ["```mermaid", "graph TD"]

        for n in nodes:
            label = cls._escape_mermaid(n["data"]["label"])
            lines.append(f"    {n['id']}[\"{label}\"]")

        for n in nodes:
            comment = n["data"].get("comment", "").strip()
            if comment:
                label = n["data"]["label"]
                safe = cls._escape_mermaid(comment)
                lines.append(f"    %% {n['id']}({label}): {safe}")

        for e in edges:
            ls = (e.get("data", {}) or {}).get("lineStyle", "solid")
            arrow = "-.->" if ls == "dashed" else "-->"
            lines.append(f"    {e['source']} {arrow} {e['target']}")

        lines.append("```")
        return cls._LEGEND + "\n" + "\n".join(lines)

    def canvas_to_mermaid(self, name: str) -> str:
        """画布全部 nodes/edges → Mermaid graph TD"""
        canvas = self._get_canvas(name)
        return self._build_mermaid(canvas["nodes"], canvas["edges"])

    def chain_to_mermaid(self, canvas_name: str, start_id: str, end_id: str) -> str:
        """两点间链路 → Mermaid graph TD"""
        chain = self.get_chain(canvas_name, start_id, end_id)
        return self._build_mermaid(chain["nodes"], chain["edges"])

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


def add_node(canvas_name: str, node_name: str, *,
             node_type: str = "custom",
             node_comment: str = "",
             node_id: str = "",
             position: Optional[dict] = None,
             path: str = "graph.json") -> dict:
    """向指定画布添加节点（便捷函数）"""
    return _get_hub(path).add_node(canvas_name, node_name,
                                   node_type=node_type, node_comment=node_comment,
                                   node_id=node_id, position=position)


def delete_node(canvas_name: str, node_id: str, path: str = "graph.json") -> dict:
    """删除指定节点及其关联边（便捷函数）"""
    return _get_hub(path).delete_node(canvas_name, node_id)


def update_node(canvas_name: str, node_id: str, *,
                node_name: str = "",
                node_type: str = "",
                node_comment: str = "",
                path: str = "graph.json") -> dict:
    """更新指定节点属性（便捷函数）"""
    return _get_hub(path).update_node(canvas_name, node_id,
                                      node_name=node_name, node_type=node_type,
                                      node_comment=node_comment)


def add_edge(canvas_name: str, from_node: str, to_node: str, *,
             edge_type: str = "solid",
             path: str = "graph.json") -> dict:
    """添加连线（便捷函数）"""
    return _get_hub(path).add_edge(canvas_name, from_node, to_node,
                                   edge_type=edge_type)


def delete_edge(canvas_name: str, from_node: str, to_node: str,
                path: str = "graph.json") -> dict:
    """删除连线（便捷函数）"""
    return _get_hub(path).delete_edge(canvas_name, from_node, to_node)


# ── 命令行测试入口 ──────────────────────────────────

if __name__ == "__main__":
    import sys, json

    path = sys.argv[1] if len(sys.argv) > 1 else "graph.json"
    hub = LineageHub(path)

    # 1. list_canvases
    print("=" * 60)
    print("1. list_canvases()")
    print("=" * 60)
    canvases = hub.list_canvases()
    print(json.dumps(canvases, ensure_ascii=False, indent=2))

    for c in canvases:
        name = c["name"]
        print(f"\n{'=' * 60}")
        print(f"画布: {name}")
        print("=" * 60)

        # 2. get_canvas (mermaid 太长只打前 200 字)
        print(f"\n2. get_canvas(\"{name}\")")
        canvas = hub.get_canvas(name)
        print(f"   节点: {len(canvas['nodes'])}  边: {len(canvas['edges'])}")
        print(f"\n   --- mermaid ---")
        print(canvas["mermaid"])

        if not canvas["nodes"]:
            continue

        # 3. get_downstream（找第一个有下游的节点）
        if canvas["edges"]:
            src = canvas["edges"][0]["source"]
            print(f"\n3. get_downstream(\"{src}\", \"{name}\")")
            for d in hub.get_downstream(src, name):
                s = "虚线" if d["lineStyle"] == "dashed" else "实线"
                print(f"     → {d['label']} [{d['id']}] ({s})")

            # 4. get_upstream（找第一个有上游的节点）
            tgt = canvas["edges"][0]["target"]
            print(f"\n4. get_upstream(\"{tgt}\", \"{name}\")")
            for u in hub.get_upstream(tgt, name):
                s = "虚线" if u["lineStyle"] == "dashed" else "实线"
                print(f"     ← {u['label']} [{u['id']}] ({s})")

        # 5. get_chain（从 root 到 leaf）
        if len(canvas["nodes"]) >= 2:
            all_ids = {n["id"] for n in canvas["nodes"]}
            has_up = {e["target"] for e in canvas["edges"]}
            has_down = {e["source"] for e in canvas["edges"]}
            roots = [nid for nid in all_ids if nid not in has_up]
            leaves = [nid for nid in all_ids if nid not in has_down]
            if roots and leaves:
                s, e = roots[0], leaves[0]
                print(f"\n5. get_chain(\"{name}\", \"{s}\", \"{e}\")")
                chain = hub.get_chain(name, s, e)
                print(chain)
                print(f"   路径节点数: {len(chain['nodes'])}  路径边数: {len(chain['edges'])}")
                print(f"\n   --- mermaid ---")
                print(chain["mermaid"])

    # 6. add_node 测试
    print("\n" + "=" * 60)
    print("6. add_node() 测试")
    print("=" * 60)

    # 取第一个画布
    name = canvases[0]["name"]

    # 6a. 指定坐标添加
    n1 = hub.add_node(name, "SDK写入-指定坐标", node_type="custom",
                      node_comment="手动指定位置", position={"x": 50, "y": 50})
    print(f"   [指定坐标] {json.dumps(n1, ensure_ascii=False)}")

    # 6b. 不指定坐标（边缘顺延算法）
    n2 = hub.add_node(name, "SDK写入-自动坐标1", node_type="DataWorks",
                      node_comment="自动推到右边")
    print(f"   [自动坐标1] {json.dumps(n2, ensure_ascii=False)}")

    # 6c. 连续第二个（验证纵向错开）
    n3 = hub.add_node(name, "SDK写入-自动坐标2", node_type="custom",
                      node_comment="应该和上一个纵向错开")
    print(f"   [自动坐标2] {json.dumps(n3, ensure_ascii=False)}")

    # 6d. 自定义 ID
    n4 = hub.add_node(name, "SDK写入-自定义ID", node_type="DataWorks",
                      node_id="my_custom_id")
    print(f"   [自定义ID]   {json.dumps(n4, ensure_ascii=False)}")

    # 6e. ID 冲突测试 — 用 6a 返回的 ID 再写一次
    conflict = hub.add_node(name, "冲突节点", node_id=n1["id"])
    print(f"   [ID冲突]     {json.dumps(conflict, ensure_ascii=False)}")

    # 验证：get_canvas 能看到新节点（冲突的那个不会写入）
    canvas_after = hub.get_canvas(name)
    print(f"\n   画布节点总数: {len(canvas_after['nodes'])}（含新加的 4 个，冲突的 1 个未写入）")

    # 7. delete_node / update_node 测试
    print("\n" + "=" * 60)
    print("7. delete_node() / update_node() 测试")
    print("=" * 60)

    # 取 n4（自定义 ID 节点），先改一下
    r1 = hub.update_node(name, n4["id"], node_name="改名后的节点", node_comment="被更新过")
    print(f"   [更新]  {json.dumps(r1, ensure_ascii=False)}")

    # 删除改名后的节点
    r2 = hub.delete_node(name, n4["id"])
    print(f"   [删除]  {json.dumps(r2, ensure_ascii=False)}")

    # 删不存在的节点
    r3 = hub.delete_node(name, "not_exist_id")
    print(f"   [删不存在] {json.dumps(r3, ensure_ascii=False)}")

    # 8. add_edge / delete_edge 测试
    print("\n" + "=" * 60)
    print("8. add_edge() / delete_edge() 测试")
    print("=" * 60)

    # 用 n2 (DataWorks) → n3 (custom)，因为 n1/n2/n3 还在
    e1 = hub.add_edge(name, n2["id"], n3["id"], edge_type="solid")
    print(f"   [加实线]  {json.dumps(e1, ensure_ascii=False)}")

    # 反向冲突：n3 → n2 应该被拒（同对节点只允许一条边）
    e2 = hub.add_edge(name, n3["id"], n2["id"])
    print(f"   [反方向]  {json.dumps(e2, ensure_ascii=False)}")

    # 重复冲突：再来一次 n2 → n3
    e3 = hub.add_edge(name, n2["id"], n3["id"])
    print(f"   [重复]    {json.dumps(e3, ensure_ascii=False)}")

    # 自己连自己
    e4 = hub.add_edge(name, n2["id"], n2["id"])
    print(f"   [自连]    {json.dumps(e4, ensure_ascii=False)}")

    # 连不存在的节点
    e5 = hub.add_edge(name, n2["id"], "not_exist")
    print(f"   [不存在]  {json.dumps(e5, ensure_ascii=False)}")

    # 成功添加后，删除
    d1 = hub.delete_edge(name, n2["id"], n3["id"])
    print(f"   [删边]    {json.dumps(d1, ensure_ascii=False)}")

    # 删除不存在的边
    d2 = hub.delete_edge(name, n2["id"], n3["id"])
    print(f"   [删不存在边] {json.dumps(d2, ensure_ascii=False)}")
