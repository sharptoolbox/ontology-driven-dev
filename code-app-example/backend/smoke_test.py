import json
import os
import tempfile

# 自测使用独立临时数据库，绝不触碰真实 data/app.db
os.environ["APP_DB_PATH"] = os.path.join(tempfile.gettempdir(), "code_app_smoke_test.db")
if os.path.exists(os.environ["APP_DB_PATH"]):
    os.remove(os.environ["APP_DB_PATH"])

from app import app

c = app.test_client()


def login(u, p):
    r = c.post('/api/auth/login', json={'username': u, 'password': p})
    d = r.get_json()
    assert d['success'], f"login {u} failed: {d}"
    return d['data']['token']


def h(t):
    return {'Authorization': 'Bearer ' + t}


def get(path, token):
    r = c.get(path, headers=h(token))
    d = r.get_json()
    assert d['success'], f"GET {path} failed: {d}"
    return d['data']


def post(path, token, data=None):
    r = c.post(path, headers=h(token), json=data or {})
    return r.get_json()


def put(path, token, data):
    r = c.put(path, headers=h(token), json=data)
    return r.get_json()


admin = login('admin', 'admin123')
sales = login('sales', '123456')
finance = login('finance', '123456')
finmgr = login('finmgr', '123456')
gm = login('gm', '123456')

# 1. 主数据
products = get('/api/masterdata/product/options', admin)
customers = get('/api/masterdata/customer/options', admin)
departments = get('/api/masterdata/department/options', admin)
employees = get('/api/masterdata/employee/options', admin)
assert len(products) >= 3 and len(customers) >= 2 and len(departments) >= 3 and len(employees) >= 3
print('1. 主数据 OK', products[0]['no'], customers[0]['no'], departments[0]['no'], employees[0]['no'])

# 员工归属部门（用于 R-13）
emp_dept = {e['id']: e['department_id'] if 'department_id' in e else None for e in
            get('/api/masterdata/employee', admin)['list']}
print('   员工列表:', json.dumps([{'id': e['id'], 'name': e['employee_name'], 'dept': e['department_id']} for e in get('/api/masterdata/employee', admin)['list']], ensure_ascii=False))

dept_id = departments[0]['id']
prod_id = products[0]['id']
cust_id = customers[0]['id']
# 找归属 dept_id 的员工
owner_id = next(e['id'] for e in get('/api/masterdata/employee', admin)['list'] if e['department_id'] == dept_id)

# 2. 创建合同草稿（<100万）
contract_data = {
    'contract_name': '测试合同A',
    'product_id': prod_id, 'customer_id': cust_id, 'department_id': dept_id,
    'contract_type': 'PRODUCT', 'sign_date': '2026-08-01', 'owner_id': owner_id,
    'total_amount': 500000, 'purchase_amount': 200000, 'tax_rate': 0.06,
    'stages': [{'stage_name': '预付款', 'pay_ratio': 40}, {'stage_name': '尾款', 'pay_ratio': 60}],
}
r = post('/api/contract/draft', sales, contract_data)
assert r['success'], f"draft failed: {r}"
cid = r['data']['id']
assert r['data']['contract_no'].startswith('CON'), r['data']['contract_no']
print('2. 合同草稿 OK', r['data']['contract_no'])

# 3. 提交合同审批
r = post(f'/api/contract/{cid}/submit', sales)
assert r['success'], f"submit failed: {r}"
assert r['data']['status'] == '待财务经理审批', r['data']['status']
print('3. 合同提交 OK -> 待财务经理审批')

# 4. 财务经理审批（<100万，直接通过）
todo = get('/api/workbench/todo', finmgr)['list']
t = [x for x in todo if x['biz_type'] == 'CONTRACT' and x['biz_id'] == cid][0]
r = post(f"/api/workbench/todo/{t['id']}/approve", finmgr, {'comment': '同意'})
assert r['success'], f"fm approve failed: {r}"
contract = get(f'/api/contract/{cid}', admin)
assert contract['status'] == '已纳入管理', contract['status']
print('4. 财务经理审批(<100万) OK -> 已纳入管理')

# 5. 大额合同（>=100万，两级审批）
big_data = dict(contract_data, contract_name='大额合同B', total_amount=2000000, purchase_amount=800000,
                stages=[{'stage_name': '首款', 'pay_ratio': 50}, {'stage_name': '尾款', 'pay_ratio': 50}])
r = post('/api/contract/draft', sales, big_data)
assert r['success'], r
big_id = r['data']['id']
post(f'/api/contract/{big_id}/submit', sales)
todo = get('/api/workbench/todo', finmgr)['list']
t = [x for x in todo if x['biz_type'] == 'CONTRACT' and x['biz_id'] == big_id][0]
post(f"/api/workbench/todo/{t['id']}/approve", finmgr, {'comment': '同意'})
contract = get(f'/api/contract/{big_id}', admin)
assert contract['status'] == '待总经理审批', contract['status']
print('5. 大额合同 财务经理审批 OK -> 待总经理审批')
todo = get('/api/workbench/todo', gm)['list']
t = [x for x in todo if x['biz_type'] == 'CONTRACT' and x['biz_id'] == big_id][0]
post(f"/api/workbench/todo/{t['id']}/approve", gm, {'comment': '同意'})
contract = get(f'/api/contract/{big_id}', admin)
assert contract['status'] == '已纳入管理', contract['status']
print('   总经理审批 OK -> 已纳入管理')

# 6. 驳回路径
rej_data = dict(contract_data, contract_name='驳回测试合同C')
r = post('/api/contract/draft', sales, rej_data)
rej_id = r['data']['id']
post(f'/api/contract/{rej_id}/submit', sales)
todo = get('/api/workbench/todo', finmgr)['list']
t = [x for x in todo if x['biz_type'] == 'CONTRACT' and x['biz_id'] == rej_id][0]
post(f"/api/workbench/todo/{t['id']}/reject", finmgr, {'comment': '资料不全'})
contract = get(f'/api/contract/{rej_id}', admin)
assert contract['status'] == '已驳回', contract['status']
print('6. 驳回路径 OK -> 已驳回')

# 7. 开票流程
inv_data = {
    'contract_id': cid, 'invoice_amount': 300000, 'invoice_tax_rate': 0.06, 'invoice_date': '2026-08-10',
    'allocations': [
        {'stage_id': '1', 'allocated_amount': 200000},
        {'stage_id': '2', 'allocated_amount': 100000},
    ],
}
r = post('/api/invoice/draft', finance, inv_data)
assert r['success'], f"invoice draft failed: {r}"
iid = r['data']['id']
assert r['data']['invoice_no'].startswith('INV'), r['data']['invoice_no']
r = post(f'/api/invoice/{iid}/submit', finance)
assert r['success'], f"invoice submit failed: {r}"
assert r['data']['approval_status'] == '待财务经理审批', r['data']['approval_status']
print('7. 开票提交 OK -> 待财务经理审批')

todo = get('/api/workbench/todo', finmgr)['list']
t = [x for x in todo if x['biz_type'] == 'INVOICE' and x['biz_id'] == iid][0]
post(f"/api/workbench/todo/{t['id']}/approve", finmgr, {'comment': '同意'})
invoice = get(f'/api/invoice/{iid}', admin)
assert invoice['approval_status'] == '已批准', invoice['approval_status']
contract = get(f'/api/contract/{cid}', admin)
stage1 = [s for s in contract['stages'] if s['stage_id'] == '1'][0]
assert stage1['invoice_status'] == '已足额开票', stage1['invoice_status']
print('8. 开票审批 OK -> 已批准，付款阶段开票状态已联动')

# 9. 收款
r = post('/api/receipt', finance, {'contract_id': cid, 'invoice_id': iid, 'receipt_amount': 300000,
                                   'receipt_time': '2026-08-15 10:00:00', 'receipt_method': 'BANK', 'remark': '全款'})
assert r['success'], f"receipt failed: {r}"
rid = r['data']['id']
assert r['data']['receipt_no'].startswith('REC'), r['data']['receipt_no']
invoice = get(f'/api/invoice/{iid}', admin)
assert invoice['received_flag'] == 1, invoice['received_flag']
assert invoice['received_amount'] == 300000, invoice['received_amount']
print('9. 收款登记 OK -> 开票收款状态联动')

# 10. 冲销
r = post(f'/api/receipt/{rid}/reverse', finance)
assert r['success'], r
invoice = get(f'/api/invoice/{iid}', admin)
assert invoice['received_flag'] == 0, invoice['received_flag']
print('10. 收款冲销 OK -> 开票收款状态回退')

# 11. 审批记录
records = get(f'/api/contract/{cid}', admin)['approval_records']
assert len(records) >= 1, records
print('11. 审批记录 OK', records[0]['approval_node'], records[0]['approval_result'])

# 12. 报表
rep_exec = get('/api/report/execution', admin)
rep_dept = get('/api/report/dept', admin)
rep_unrec = get('/api/report/unreceived', admin)
assert rep_exec['total'] >= 1
assert len(rep_dept) >= 1
print('12. 报表 OK', 'execution:', rep_exec['total'], 'dept:', len(rep_dept), 'unreceived:', rep_unrec['total'])

# 13. 流程实例/任务
instances = get('/api/flow/instances', admin)
assert instances['total'] >= 3
print('13. 流程实例 OK', instances['total'])

print('\n===== 全部测试通过 =====')
