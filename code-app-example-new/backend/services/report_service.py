"""部门合同统计分析报表（M2 FUN-013 / FUN-014，M7 报表口径）。

口径：
- 合同签订总金额：签订时间落在区间内且状态为审批中/已生效/已关闭的合同总金额，草稿不计入；
- 开票总金额：开票时间落在区间内且合同属于该部门的开票金额；
- 已开票未收款金额：区间内开票在统计期末的（开票金额 − 截至期末累计已收款），结果不小于 0；
- 权限：销售人员、普通员工仅统计本人所属部门，其他角色统计权限范围内全部部门。
"""

import datetime
import io

import db
from services import scope_service
from utils.rules import money


class BusinessError(ValueError):
    pass


def _month_start():
    today = datetime.date.today()
    return today.replace(day=1).isoformat()


def default_range():
    return {"start_date": _month_start(), "end_date": datetime.date.today().isoformat()}


def _parse_depts(raw, ctx, conn=None):
    """解析部门范围，并按权限收敛。"""
    rows = db.query(
        "SELECT dept_no, dept_name FROM mdm_department WHERE flag=1 ORDER BY dept_no", (), conn
    )
    all_nos = [r["dept_no"] for r in rows]
    if ctx["scope_all"]:
        allowed = all_nos
    else:
        allowed = [ctx["dept_no"]] if ctx["dept_no"] in all_nos else []

    requested = []
    if isinstance(raw, (list, tuple)):
        requested = [str(x).strip() for x in raw if str(x).strip()]
    elif raw:
        requested = [x.strip() for x in str(raw).split(",") if x.strip()]

    if not requested:
        selected = allowed
    else:
        selected = [d for d in requested if d in allowed]
        if not selected:
            raise BusinessError("所选部门不在数据权限范围内")
    return rows, selected


def query(ctx, params):
    start_date = (params.get("start_date") or "").strip() or _month_start()
    end_date = (params.get("end_date") or "").strip() or datetime.date.today().isoformat()
    if end_date < start_date:
        raise BusinessError("统计截止时间不得早于起始时间")

    departments, selected = _parse_depts(params.get("depts") or params.get("dept_no"), ctx)
    if not selected:
        raise BusinessError("当前用户未配置所属部门，无法统计")

    result = []
    for index, dept in enumerate([d for d in departments if d["dept_no"] in selected], start=1):
        dept_no = dept["dept_no"]
        sign_total = db.query_one(
            """
            SELECT COALESCE(SUM(total_amount), 0) AS s FROM contract
            WHERE flag=1 AND dept_no=? AND sign_date BETWEEN ? AND ?
              AND status IN ('APPROVING','EFFECTIVE','CLOSED')
            """,
            (dept_no, start_date, end_date),
        )["s"]
        invoice_total = db.query_one(
            """
            SELECT COALESCE(SUM(i.invoice_amount), 0) AS s
            FROM contract_invoice i
            JOIN contract c ON c.contract_no = i.contract_no AND c.flag = 1
            WHERE i.flag=1 AND c.dept_no=? AND i.invoice_date BETWEEN ? AND ?
            """,
            (dept_no, start_date, end_date),
        )["s"]
        unreceived = db.query_one(
            """
            SELECT COALESCE(SUM(
                       CASE WHEN i.invoice_amount - COALESCE((
                                SELECT SUM(r.receive_amount) FROM contract_receipt r
                                WHERE r.invoice_no = i.invoice_no AND r.flag = 1 AND r.receive_date <= ?
                            ), 0) < 0 THEN 0
                            ELSE i.invoice_amount - COALESCE((
                                SELECT SUM(r.receive_amount) FROM contract_receipt r
                                WHERE r.invoice_no = i.invoice_no AND r.flag = 1 AND r.receive_date <= ?
                            ), 0)
                       END), 0) AS s
            FROM contract_invoice i
            JOIN contract c ON c.contract_no = i.contract_no AND c.flag = 1
            WHERE i.flag=1 AND c.dept_no=? AND i.invoice_date BETWEEN ? AND ?
            """,
            (end_date, end_date, dept_no, start_date, end_date),
        )["s"]

        result.append({
            "seq": index,
            "dept_no": dept_no,
            "dept_name": dept["dept_name"],
            "sign_amount": money(sign_total),
            "invoice_amount": money(invoice_total),
            "unreceived_amount": max(0.0, money(unreceived)),
        })

    totals = {
        "seq": "合计",
        "dept_no": "",
        "dept_name": "",
        "sign_amount": money(sum(r["sign_amount"] for r in result)),
        "invoice_amount": money(sum(r["invoice_amount"] for r in result)),
        "unreceived_amount": money(sum(r["unreceived_amount"] for r in result)),
    }
    return {
        "list": result,
        "total_row": totals,
        "criteria": {
            "start_date": start_date,
            "end_date": end_date,
            "depts": selected,
            "dept_count": len(selected),
            "row_count": len(result),
        },
    }


def export(ctx, params):
    data = query(ctx, params)
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "部门合同统计"

    criteria = data["criteria"]
    sheet.append(["部门合同统计分析"])
    sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=6)
    sheet["A1"].font = Font(size=14, bold=True)
    sheet["A1"].alignment = Alignment(horizontal="center")

    sheet.append(["统计时间段：{} ~ {}".format(criteria["start_date"], criteria["end_date"])])
    sheet.merge_cells(start_row=2, start_column=1, end_row=2, end_column=6)
    sheet["A2"].font = Font(size=10, color="666666")

    headers = ["序号", "部门编号", "部门名称", "合同签订总金额(元)", "开票总金额(元)", "已开票未收款金额(元)"]
    sheet.append(headers)

    thin = Side(style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill("solid", fgColor="F4F6F9")
    for cell in sheet[3]:
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = border

    for row in data["list"]:
        sheet.append([
            row["seq"], row["dept_no"], row["dept_name"],
            row["sign_amount"], row["invoice_amount"], row["unreceived_amount"],
        ])
    total = data["total_row"]
    sheet.append([
        "合计", "", "", total["sign_amount"], total["invoice_amount"], total["unreceived_amount"],
    ])

    for row in sheet.iter_rows(min_row=4, max_row=sheet.max_row, min_col=1, max_col=6):
        for cell in row:
            cell.border = border
        for cell in row[3:]:
            cell.number_format = "#,##0.00"
    for cell in sheet[sheet.max_row]:
        cell.font = Font(bold=True)

    widths = [8, 14, 18, 22, 18, 24]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[chr(64 + index)].width = width

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    filename = "部门合同统计_{}-{}.xlsx".format(
        criteria["start_date"].replace("-", ""), criteria["end_date"].replace("-", "")
    )
    return buffer, filename
