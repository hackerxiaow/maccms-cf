// Cloudflare-native operations and MacCMS10 community/commerce modules.
(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};

  var columns = {
    danmaku: ['danmaku_id','user_name','vod_id','episode_id','position_ms','content','status','created_at'],
    chat: ['message_id','user_name','room_key','content','status','created_at'],
    messages: ['pm_id','sender_id','receiver_id','content','is_read','status','created_at'],
    shares: ['share_id','user_id','model','content_id','channel','client_ip','created_at'],
    cash: ['cash_id','user_id','cash_type','amount','points','note','operator','created_at'],
    coupons: ['coupon_id','coupon_code','coupon_name','discount_type','discount_value','used_count','max_uses','status'],
    goods: ['goods_id','goods_name','price','points','inventory','status','sort'],
    'mall-orders': ['mall_order_id','order_code','user_id','goods_id','quantity','total_price','discount_amount','total_points','status','created_at'],
    notices: ['notice_id','title','notice_type','status','starts_at','ends_at','created_at'],
    signs: ['sign_id','user_id','sign_day','points','created_at'],
    'play-fails': ['fail_id','vod_id','vod_name','play_from','play_part','message','status','created_at']
  };
  var labels = {
    danmaku:'弹幕审核',chat:'聊天室审核',messages:'会员私信',shares:'分享记录',cash:'积分与资金流水',
    coupons:'优惠券',goods:'积分商城商品','mall-orders':'商城订单',notices:'站点公告',signs:'签到记录','play-fails':'播放报错'
  };

  ['danmaku','chat','messages','shares','cash','coupons','goods','mall-orders','notices','signs','play-fails'].forEach(function (resource) {
    Views[resource] = function (host) { renderDataset(host, resource, 1); };
  });

  Views.seckill = async function(host){
    host.innerHTML='<div class="toolbar"><button class="btn-create" id="seckillAdd">+ 新增秒杀活动</button><span class="sub">活动独立扣减库存；秒杀订单不叠加优惠券，取消待核款订单会恢复活动库存。</span></div><div class="admin-card"><div id="seckillRows"></div></div>';
    var result=await App.req('/cloud/seckill'),data=result.data||{},campaigns=data.campaigns||[],goods=data.goods||[];
    App.on('seckillAdd','click',function(){editSeckill(null,goods,host);});
    document.getElementById('seckillRows').innerHTML=tableHtml(campaigns,['campaign_id','campaign_name','goods_name','sale_price','inventory','starts_at','ends_at','status'],function(item){return '<button class="action-btn" data-edit-seckill="'+item.campaign_id+'">编辑</button> <button class="action-btn del" data-delete-seckill="'+item.campaign_id+'">删除</button>';});
    host.querySelectorAll('[data-edit-seckill]').forEach(function(button){button.onclick=function(){editSeckill(campaigns.find(function(row){return row.campaign_id===Number(button.dataset.editSeckill);}),goods,host);};});
    host.querySelectorAll('[data-delete-seckill]').forEach(function(button){button.onclick=async function(){if(!confirm('删除此活动？已有订单的活动需要停用保留。'))return;var removed=await App.req('/cloud/seckill/'+button.dataset.deleteSeckill,{method:'DELETE'});if(removed.code!==0)App.toast(removed.msg||'删除失败',true);Views.seckill(host);};});
  };

  function editSeckill(item,goods,host){
    item=item||{};
    var choices=goods.map(function(row){return {value:row.goods_id,label:row.goods_name+'（原价 ¥'+Number(row.price||0).toFixed(2)+'，库存 '+Number(row.inventory||0)+'）'};});
    var body=App.field('活动名称',App.input('seckillName',item.campaign_name||''))+App.field('商品',App.select('seckillGoods',choices,item.goods_id||'', '选择商品'))+
      '<div class="row2">'+App.field('秒杀价',App.input('seckillPrice',item.sale_price||0,'','number'))+App.field('活动库存',App.input('seckillInventory',item.inventory||0,'','number'))+'</div>'+
      '<div class="row2">'+App.field('开始时间戳（0 立即）',App.input('seckillStarts',item.starts_at||0,'','number'))+App.field('结束时间戳（0 不限）',App.input('seckillEnds',item.ends_at||0,'','number'))+'</div>'+
      App.field('状态',App.select('seckillStatus',[{value:1,label:'启用'},{value:0,label:'停用'}],item.status==null?1:item.status));
    App.modal(item.campaign_id?'编辑秒杀活动':'新增秒杀活动',body,async function(){var saved=await App.req('/cloud/seckill/save',{method:'POST',body:{campaign_id:item.campaign_id||0,campaign_name:App.val('seckillName'),goods_id:App.intVal('seckillGoods'),sale_price:Number(App.val('seckillPrice'))||0,inventory:App.intVal('seckillInventory'),starts_at:App.intVal('seckillStarts'),ends_at:App.intVal('seckillEnds'),status:App.intVal('seckillStatus')}});if(saved.code===0){App.closeModal();Views.seckill(host);}else App.toast(saved.msg||'保存失败',true);});
  }

  Views.signs = async function(host){
    host.innerHTML='<div class="toolbar"><button class="btn-create" id="milestoneAdd">+ 新增连续签到奖励</button><span class="sub">达到连续签到天数时自动发放一次积分奖励；奖励流水记入会员积分账本。</span></div><div class="row2"><div class="admin-card"><div class="card-head"><h3>连续签到奖励</h3></div><div id="milestoneRows"></div></div><div class="admin-card"><div class="card-head"><h3>近期签到</h3></div><div id="signRows"></div></div></div><div class="admin-card"><div class="card-head"><h3>里程碑领取记录</h3></div><div id="milestoneClaims"></div></div>';
    App.on('milestoneAdd','click',function(){editMilestone(null,host);});
    var result=await App.req('/cloud/sign-milestones'),data=result.data||{};
    document.getElementById('milestoneRows').innerHTML=tableHtml(data.milestones||[],['sign_days','reward_name','reward_points','status'],function(item){return '<button class="action-btn" data-edit-milestone="'+item.milestone_id+'">编辑</button> <button class="action-btn del" data-delete-milestone="'+item.milestone_id+'">删除</button>';});
    document.getElementById('signRows').innerHTML=tableHtml(data.signs||[],['user_name','sign_day','points','created_at']);
    document.getElementById('milestoneClaims').innerHTML=tableHtml(data.claims||[],['user_name','sign_days','reward_name','reward_points','claimed_at']);
    host.querySelectorAll('[data-edit-milestone]').forEach(function(button){button.onclick=function(){editMilestone((data.milestones||[]).find(function(row){return row.milestone_id===Number(button.dataset.editMilestone);}),host);};});
    host.querySelectorAll('[data-delete-milestone]').forEach(function(button){button.onclick=async function(){if(!confirm('删除此奖励规则？已有领取记录的规则只能停用。'))return;var removed=await App.req('/cloud/sign-milestones/'+button.dataset.deleteMilestone,{method:'DELETE'});if(removed.code!==0)App.toast(removed.msg||'删除失败',true);Views.signs(host);};});
  };

  function editMilestone(item,host){
    item=item||{};
    var body='<div class="row2">'+App.field('连续签到天数',App.input('milestoneDays',item.sign_days||7,'至少 2 天','number'))+
      App.field('奖励积分',App.input('milestonePoints',item.reward_points||0,'','number'))+'</div>'+App.field('奖励名称',App.input('milestoneName',item.reward_name||''))+
      App.field('状态',App.select('milestoneStatus',[{value:1,label:'启用'},{value:0,label:'停用'}],item.status==null?1:item.status));
    App.modal(item.milestone_id?'编辑连续签到奖励':'新增连续签到奖励',body,async function(){
      var result=await App.req('/cloud/sign-milestones',{method:'POST',body:{milestone_id:item.milestone_id||0,sign_days:App.intVal('milestoneDays'),reward_points:App.intVal('milestonePoints'),reward_name:App.val('milestoneName'),status:App.intVal('milestoneStatus')}});
      if(result.code===0){App.closeModal();Views.signs(host);}else App.toast(result.msg||'保存失败',true);
    });
  }

  async function renderDataset(host, resource, page) {
    page = page || 1;
    var canEdit = ['coupons','goods','notices'].includes(resource);
    var body = '<div class="toolbar"><input class="input-box" id="cloudDataKw" placeholder="搜索记录" style="max-width:260px">' +
      (resource === 'mall-orders' ? App.select('cloudDataStatus', [{value:'',label:'全部订单'},{value:0,label:'待核款'},{value:1,label:'已确认'},{value:2,label:'已完成'},{value:3,label:'已取消'}], '', null) :
        (['danmaku','chat','messages','play-fails','coupons','goods','notices'].includes(resource) ? App.select('cloudDataStatus', [{value:'',label:'全部状态'},{value:0,label:'待处理/停用'},{value:1,label:'已通过/启用'}], '', null) : '')) +
      '<button class="action-btn" id="cloudDataSearch">搜索</button>' + (canEdit ? '<button class="btn-create" id="cloudDataAdd">+ 新增</button>' : '') +
      (resource === 'cash' ? '<button class="btn-create" id="cashAdjust">积分调整</button>' : '') +
      '</div><div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr><th><input type="checkbox" id="cloudSelectAll"></th>' +
      columns[resource].map(function (key) { return '<th>' + App.esc(key) + '</th>'; }).join('') + '<th>操作</th></tr></thead><tbody id="cloudDataRows"></tbody></table></div><div id="cloudDataPager"></div></div>';
    host.innerHTML = body;
    App.on('cloudDataSearch','click',function(){renderDataset(host,resource,1);});
    App.on('cloudDataAdd','click',function(){openEditor(resource,null,host);});
    App.on('cashAdjust','click',openCashAdjustment);
    var query = '?page=' + page + '&limit=30&wd=' + encodeURIComponent(App.val('cloudDataKw'));
    if (document.getElementById('cloudDataStatus') && App.val('cloudDataStatus') !== '') query += '&status=' + App.val('cloudDataStatus');
    var result = await App.req('/cloud/data/' + resource + query);
    var data = result.data || {list:[]};
    var rows = data.list || [];
    var keyId = columns[resource][0];
    var rowsHost = document.getElementById('cloudDataRows');
    if (!rowsHost) return;
    rowsHost.innerHTML = rows.length ? rows.map(function(item){
      return '<tr><td><input type="checkbox" data-row-id="' + Number(item[keyId]) + '"></td>' + columns[resource].map(function(key){
        var value = item[key];
        if (key === 'created_at' || key === 'starts_at' || key === 'ends_at') value = value ? App.fmtTime(value) : '不限';
        if (key === 'content' || key === 'message' || key === 'note') value = String(value || '').slice(0,100);
        if (key === 'status' && value !== undefined) value = resource === 'mall-orders'
          ? ({0:'待核款',1:'已确认',2:'已完成',3:'已取消'}[Number(value)] || '未知')
          : Number(value) === 1 ? '已通过 / 启用' : '待审核 / 停用';
        return '<td>' + App.esc(value == null ? '' : value) + '</td>';
      }).join('') + '<td>' + (canEdit ? '<button class="action-btn" data-edit="' + item[keyId] + '">编辑</button> ' : '') +
        (resource === 'mall-orders'
          ? (Number(item.status) === 0 ? '<button class="action-btn" data-order-status="1" data-order-id="' + item[keyId] + '">确认收款</button> <button class="action-btn del" data-order-status="3" data-order-id="' + item[keyId] + '">取消订单</button>'
            : Number(item.status) === 1 ? '<button class="action-btn" data-order-status="2" data-order-id="' + item[keyId] + '">标记完成</button>' : '')
          : (Object.prototype.hasOwnProperty.call(item,'status') ? '<button class="action-btn" data-status="' + item[keyId] + '" data-current="' + Number(item.status) + '">' + (Number(item.status) === 1 ? '隐藏' : '通过') + '</button> ' : '') +
            '<button class="action-btn del" data-delete="' + item[keyId] + '">删除</button>') + '</td></tr>';
    }).join('') : '<tr><td class="empty" colspan="' + (columns[resource].length + 2) + '">暂无记录</td></tr>';
    var selectAll = document.getElementById('cloudSelectAll');
    if (selectAll) selectAll.onchange = function(){rowsHost.querySelectorAll('[data-row-id]').forEach(function(box){box.checked=selectAll.checked;});};
    rowsHost.querySelectorAll('[data-edit]').forEach(function(button){button.onclick=function(){openEditor(resource,rows.find(function(item){return Number(item[keyId])===Number(button.dataset.edit);}),host);};});
    rowsHost.querySelectorAll('[data-status]').forEach(function(button){button.onclick=async function(){await App.req('/cloud/data/'+resource+'/status',{method:'POST',body:{ids:[Number(button.dataset.status)],status:Number(button.dataset.current)===1?0:1}});renderDataset(host,resource,page);};});
    rowsHost.querySelectorAll('[data-order-status]').forEach(function(button){button.onclick=async function(){
      var target=Number(button.dataset.orderStatus),label=target===1?'确认已收款？':target===2?'确认订单已完成履约？':'取消订单并退还库存、积分和优惠券？';
      if(!confirm(label))return;
      var changed=await App.req('/cloud/orders/'+button.dataset.orderId+'/status',{method:'POST',body:{status:target}});
      if(changed.code!==0)App.toast(changed.msg||'状态更新失败',true);else App.toast(changed.msg);
      renderDataset(host,resource,page);
    };});
    rowsHost.querySelectorAll('[data-delete]').forEach(function(button){button.onclick=async function(){if(!confirm('确定删除这条记录？'))return;await App.req('/cloud/data/'+resource+'/'+button.dataset.delete,{method:'DELETE'});renderDataset(host,resource,page);};});
    var pager = document.getElementById('cloudDataPager');
    if (pager) pager.innerHTML = App.pager(data,function(next){renderDataset(host,resource,next);});
    var bulk = document.getElementById('cloudDataStatus');
    if (bulk && resource !== 'mall-orders') bulk.onchange = async function(){
      var selected = Array.from(rowsHost.querySelectorAll('[data-row-id]:checked')).map(function(box){return Number(box.dataset.rowId);});
      if (selected.length && this.value !== '') { await App.req('/cloud/data/'+resource+'/status',{method:'POST',body:{ids:selected,status:Number(this.value)}}); renderDataset(host,resource,page); }
    };
  }

  function openEditor(resource,item,host){
    item=item||{};
    var fields={
      coupons:[['coupon_name','优惠券名称','text'],['coupon_code','兑换码（留空自动生成）','text'],['discount_type','折扣类型','select'],['discount_value','折扣额度','number'],['min_spend','最低消费','number'],['max_uses','可领取数量','number'],['starts_at','开始时间戳（0 不限）','number'],['ends_at','结束时间戳（0 不限）','number'],['status','状态','select']],
      goods:[['goods_name','商品名称','text'],['goods_pic','图片地址','text'],['price','现金价格（线下核验）','number'],['points','积分价格（0 表示现金）','number'],['inventory','库存','number'],['sort','排序','number'],['goods_desc','商品说明','textarea'],['status','状态','select']],
      notices:[['title','公告标题','text'],['notice_type','公告类型','text'],['starts_at','开始时间戳（0 立即）','number'],['ends_at','结束时间戳（0 不限）','number'],['content','公告内容','textarea'],['status','状态','select']]
    }[resource]||[];
    var body=fields.map(function(field){
      var key=field[0],title=field[1],kind=field[2],value=item[key];
      if(kind==='select'){
        var choices=key==='discount_type'?[{value:'fixed',label:'固定金额'},{value:'percent',label:'百分比'}]:[{value:1,label:'启用'},{value:0,label:'停用'}];
        return App.field(title,App.select('cloudEdit_'+key,choices,value==null?(key==='status'?1:'fixed'):value));
      }
      if(kind==='textarea') return App.field(title,App.textarea('cloudEdit_'+key,value,4));
      return App.field(title,App.input('cloudEdit_'+key,value==null?'':value,'',kind==='number'?'number':'text'));
    }).join('');
    App.modal((item[columns[resource][0]]?'编辑':'新增')+labels[resource],body,async function(){
      var payload={id:item[columns[resource][0]]||0};
      fields.forEach(function(field){var key=field[0],el=document.getElementById('cloudEdit_'+key);payload[key]=field[2]==='number'?Number(el.value)||0:(el?el.value:'');});
      var result=await App.req('/cloud/data/'+resource+'/save',{method:'POST',body:payload});
      if(result.code===0){App.closeModal();App.toast(result.msg);renderDataset(host,resource,1);}else App.toast(result.msg||'保存失败',true);
    });
  }

  async function openCashAdjustment(){
    var body=App.field('会员 ID',App.input('cashUserId','','必填','number'))+
      App.field('调整积分（可正可负）',App.input('cashPoints','0','','number'))+
      App.field('现金金额记账（不触发支付）',App.input('cashAmount','0','','number'))+
      App.field('备注',App.textarea('cashNote','管理员手动调整',3));
    App.modal('会员积分调整',body,async function(){
      var result=await App.req('/cloud/cash/adjust',{method:'POST',body:{user_id:App.intVal('cashUserId'),points:Number(App.val('cashPoints'))||0,amount:Number(App.val('cashAmount'))||0,note:App.val('cashNote')}});
      if(result.code===0){App.closeModal();App.toast(result.msg);Views.cash(document.getElementById('viewHost'));}else App.toast(result.msg||'调整失败',true);
    });
  }

  Views.accounts = async function(host){
    host.innerHTML='<div class="toolbar"><button class="btn-create" id="accountAdd">+ 新增管理员</button><button class="action-btn" id="roleManage">管理角色</button><span class="sub">角色会在 API 层校验；删除或停用账号会立即撤销后续请求。</span></div><div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>账号</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead><tbody id="accountRows"></tbody></table></div></div>';
    var [accounts,roles]=await Promise.all([App.req('/cloud/accounts'),App.req('/cloud/accounts/roles')]);
    var rows=accounts.data||[], roleList=roles.data||[];
    document.getElementById('accountRows').innerHTML=rows.map(function(item){return '<tr><td>'+App.esc(item.username)+'</td><td>'+App.esc(item.role_name||item.role_key)+'</td><td>'+(item.status?'启用':'停用')+'</td><td>'+App.fmtTime(item.last_login_at)+'</td><td>'+(item.admin_id?'<button class="action-btn" data-edit="'+item.admin_id+'">编辑</button> <button class="action-btn del" data-delete="'+item.admin_id+'">删除</button>':'主账号由系统设置管理')+'</td></tr>';}).join('');
    App.on('accountAdd','click',function(){editAccount(null,roleList,host);});
    App.on('roleManage','click',function(){manageRoles(roleList,host);});
    host.querySelectorAll('[data-edit]').forEach(function(button){button.onclick=function(){editAccount(rows.find(function(row){return row.admin_id===Number(button.dataset.edit);}),roleList,host);};});
    host.querySelectorAll('[data-delete]').forEach(function(button){button.onclick=async function(){if(!confirm('删除此管理员？'))return;var result=await App.req('/cloud/accounts/'+button.dataset.delete,{method:'DELETE'});App.toast(result.msg);Views.accounts(host);};});
  };
  function manageRoles(roles,host){
    var builtins=['administrator','editor','support'];
    var rows=roles.map(function(role){var perms=[];try{perms=JSON.parse(role.permissions||'[]');}catch{}return '<tr><td>'+App.esc(role.role_key)+'</td><td>'+App.esc(role.role_name)+'</td><td>'+App.esc(perms.join(', '))+'</td><td>'+(builtins.includes(role.role_key)?'内置角色':'<button class="action-btn del" data-delete-role="'+App.esc(role.role_key)+'">删除</button>')+'</td></tr>';}).join('');
    var body='<div class="admin-card"><div style="overflow:auto"><table class="data-table"><thead><tr><th>标识</th><th>角色名</th><th>权限</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
      App.field('新角色标识（英文）',App.input('roleKey',''))+App.field('角色名称',App.input('roleName',''))+
      '<div class="form-group"><label class="form-label">模块权限</label><div class="check-grid">'+[['content','内容管理'],['collect','采集配置'],['users','用户中心'],['ops','运营互动'],['system','系统管理']].map(function(pair){return '<label><input type="checkbox" data-role-perm="'+pair[0]+'"> '+pair[1]+'</label>';}).join('')+'</div></div>';
    App.modal('管理员角色管理',body,async function(){var permissions=Array.from(document.querySelectorAll('[data-role-perm]:checked')).map(function(box){return box.dataset.rolePerm;});var result=await App.req('/cloud/accounts/roles',{method:'POST',body:{role_key:App.val('roleKey'),role_name:App.val('roleName'),permissions:permissions}});if(result.code===0){App.closeModal();App.toast(result.msg);Views.accounts(host);}else App.toast(result.msg||'保存失败',true);},'保存角色');
    document.querySelectorAll('[data-delete-role]').forEach(function(button){button.onclick=async function(){var result=await App.req('/cloud/accounts/roles/'+encodeURIComponent(button.dataset.deleteRole),{method:'DELETE'});App.toast(result.msg);if(result.code===0){App.closeModal();Views.accounts(host);}else manageRoles(roles,host);};});
  }
  function editAccount(item,roles,host){
    item=item||{};
    var options=roles.map(function(role){return {value:role.role_key,label:role.role_name+' ('+JSON.parse(role.permissions||'[]').join(', ')+')'};});
    var body=App.field('登录账号',App.input('accountName',item.username||''))+
      App.field(item.admin_id?'新密码（留空保持原密码）':'登录密码（至少 8 位）',App.input('accountPassword','','','password'))+
      App.field('权限角色',App.select('accountRole',options,item.role_key||'editor'))+
      App.field('状态',App.select('accountStatus',[{value:1,label:'启用'},{value:0,label:'停用'}],item.status==null?1:item.status));
    App.modal(item.admin_id?'编辑管理员':'新增管理员',body,async function(){
      var result=await App.req('/cloud/accounts/save',{method:'POST',body:{admin_id:item.admin_id||0,username:App.val('accountName'),password:App.val('accountPassword'),role_key:App.val('accountRole'),status:App.intVal('accountStatus')}});
      if(result.code===0){App.closeModal();App.toast(result.msg);Views.accounts(host);}else App.toast(result.msg||'保存失败',true);
    });
  }

  Views.media = async function(host){
    host.innerHTML='<div class="admin-card"><div class="card-head"><h3>Cloudflare R2 图片存储</h3></div><p class="sub">支持 JPEG、PNG、WebP、GIF、AVIF，单文件不超过 10 MB。上传需要部署时绑定 MEDIA_BUCKET。</p><div class="toolbar"><input type="file" id="mediaFile" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"><button class="btn-create" id="mediaUpload">上传图片</button></div><div id="mediaHint" class="sub"></div></div><div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>预览</th><th>原文件名</th><th>类型</th><th>大小</th><th>URL</th><th>上传时间</th><th>操作</th></tr></thead><tbody id="mediaRows"></tbody></table></div><div id="mediaPager"></div></div>';
    App.on('mediaUpload','click',async function(){
      var file=document.getElementById('mediaFile').files[0];if(!file){App.toast('请选择图片文件',true);return;}
      var form=new FormData();form.append('file',file);
      var response=await fetch('/api/admin/cloud/media',{method:'POST',headers:{Authorization:'Bearer '+App.token},body:form});
      var result=await response.json().catch(function(){return {msg:'上传响应无效'};});
      var hint=document.getElementById('mediaHint');if(hint)hint.textContent=result.msg||'';
      if(result.code===0){App.toast('图片上传成功：'+result.data.public_url);Views.media(host);}else App.toast(result.msg||'上传失败',true);
    });
    renderMedia(host,1);
  };
  async function renderMedia(host,page){
    var result=await App.req('/cloud/media?page='+page+'&limit=24'),data=result.data||{list:[]},rows=data.list||[],tbody=document.getElementById('mediaRows');
    if(!tbody)return;
    tbody.innerHTML=rows.length?rows.map(function(row){return '<tr><td><img src="'+App.esc(row.public_url)+'" alt="" style="width:64px;height:44px;object-fit:cover;border-radius:5px"></td><td>'+App.esc(row.file_name)+'</td><td>'+App.esc(row.content_type)+'</td><td>'+Math.round((row.file_size||0)/1024)+' KB</td><td><input readonly class="input-box" value="'+App.esc(row.public_url)+'" style="min-width:220px" onclick="this.select()"></td><td>'+App.fmtTime(row.created_at)+'</td><td><button class="action-btn del" data-delete="'+row.media_id+'">删除</button></td></tr>';}).join(''):'<tr><td colspan="7" class="empty">尚无媒体文件</td></tr>';
    tbody.querySelectorAll('[data-delete]').forEach(function(button){button.onclick=async function(){if(!confirm('删除 R2 文件及数据库记录？'))return;await App.req('/cloud/media/'+button.dataset.delete,{method:'DELETE'});renderMedia(host,page);};});
    var pager=document.getElementById('mediaPager');if(pager)pager.innerHTML=App.pager(data,function(next){renderMedia(host,next);});
    if(!data.bucket_ready){var hint=document.getElementById('mediaHint');if(hint)hint.textContent='R2 未绑定：后台仍可管理已有地址，但不能上传或删除对象。';}
  }

  Views.quality = async function(host){
    host.innerHTML='<div class="toolbar"><button class="btn-create" id="qualityAdd">+ 新增规则</button><button class="action-btn" id="qualityRun">运行内容扫描</button></div><div class="row2"><div class="admin-card"><div class="card-head"><h3>规则</h3></div><div id="qualityRules"></div></div><div class="admin-card"><div class="card-head"><h3>待处理问题</h3></div><div id="qualityIssues"></div></div></div>';
    App.on('qualityAdd','click',function(){editQuality(null,host);});
    App.on('qualityRun','click',async function(){var result=await App.req('/cloud/quality/run',{method:'POST',body:{}});App.toast(result.msg||'扫描完成');Views.quality(host);});
    var result=await App.req('/cloud/quality/rules'),data=result.data||{};
    document.getElementById('qualityRules').innerHTML=tableHtml(data.rules||[],['rule_id','rule_name','model','field_name','match_text','severity','status'],function(item){return '<button class="action-btn del" data-delete-rule="'+item.rule_id+'">删除</button>';});
    document.getElementById('qualityIssues').innerHTML=tableHtml(data.issues||[],['issue_id','model','content_id','content_name','field_name','excerpt','created_at'],function(item){return '<button class="action-btn" data-resolve="'+item.issue_id+'">标记已处理</button>';});
    host.querySelectorAll('[data-delete-rule]').forEach(function(button){button.onclick=async function(){await App.req('/cloud/quality/rules/'+button.dataset.deleteRule,{method:'DELETE'});Views.quality(host);};});
    host.querySelectorAll('[data-resolve]').forEach(function(button){button.onclick=async function(){await App.req('/cloud/quality/issues/'+button.dataset.resolve+'/status',{method:'POST',body:{status:1}});Views.quality(host);};});
  };
  function editQuality(item,host){
    item=item||{};
    var models=[{value:'vod',label:'影片'},{value:'art',label:'文章'},{value:'topic',label:'专题'},{value:'manga',label:'漫画'},{value:'actor',label:'明星'},{value:'website',label:'网址'}];
    var body=App.field('规则名称',App.input('qualityName',item.rule_name||''))+
      '<div class="row2">'+App.field('模型',App.select('qualityModel',models,item.model||'vod'))+App.field('字段名',App.input('qualityField',item.field_name||'vod_name'))+'</div>'+
      App.field('匹配文本',App.input('qualityMatch',item.match_text||''))+
      App.field('严重级别',App.select('qualitySeverity',[{value:'warning',label:'提醒'},{value:'block',label:'阻断标记'}],item.severity||'warning'));
    App.modal('新增内容质检规则',body,async function(){var result=await App.req('/cloud/quality/rules/save',{method:'POST',body:{rule_name:App.val('qualityName'),model:App.val('qualityModel'),field_name:App.val('qualityField'),match_text:App.val('qualityMatch'),severity:App.val('qualitySeverity')}});if(result.code===0){App.closeModal();Views.quality(host);}else App.toast(result.msg||'保存失败',true);});
  }

  Views.tasks = async function(host){
    host.innerHTML='<div class="toolbar"><button class="btn-create" id="taskAdd">+ 新增边缘任务</button><span class="sub">Workers Cron 每 5 分钟检查一次到期任务；任务数据保存在 D1。</span></div><div class="row2"><div class="admin-card"><div class="card-head"><h3>任务计划</h3></div><div id="taskRows"></div></div><div class="admin-card"><div class="card-head"><h3>最近执行</h3></div><div id="taskLogs"></div></div></div>';
    App.on('taskAdd','click',function(){editTask(null,[],host);});
    var result=await App.req('/cloud/tasks'),data=result.data||{};
    document.getElementById('taskRows').innerHTML=tableHtml(data.tasks||[],['task_id','task_name','task_type','node_id','interval_minutes','enabled','next_run_at','last_status','last_message'],function(item){return '<button class="action-btn" data-run-task="'+item.task_id+'">立即执行</button> <button class="action-btn" data-edit-task="'+item.task_id+'">编辑</button> <button class="action-btn del" data-delete-task="'+item.task_id+'">删除</button>';});
    document.getElementById('taskLogs').innerHTML=tableHtml(data.logs||[],['task_id','task_name','success','message','duration_ms','created_at']);
    host.querySelectorAll('[data-run-task]').forEach(function(button){button.onclick=async function(){var r=await App.req('/cloud/tasks/'+button.dataset.runTask+'/run',{method:'POST',body:{}});App.toast(r.msg);Views.tasks(host);};});
    host.querySelectorAll('[data-edit-task]').forEach(function(button){button.onclick=function(){editTask((data.tasks||[]).find(function(task){return task.task_id===Number(button.dataset.editTask);}),data.nodes||[],host);};});
    host.querySelectorAll('[data-delete-task]').forEach(function(button){button.onclick=async function(){await App.req('/cloud/tasks/'+button.dataset.deleteTask,{method:'DELETE'});Views.tasks(host);};});
  };
  function editTask(item,nodes,host){
    item=item||{};
    var nodeOptions=nodes.map(function(node){return {value:node.id,label:node.name+' (#'+node.id+')'};});
    var body=App.field('任务名称',App.input('taskName',item.task_name||''))+
      App.field('任务类型',App.select('taskType',[{value:'collect_node',label:'资源站采集'},{value:'cleanup_logs',label:'清理 90 天前运行日志'},{value:'reset_hits',label:'清零日访问计数'}],item.task_type||'collect_node'))+
      App.field('采集节点（采集任务必填）',App.select('taskNode',nodeOptions,item.node_id||'', '请选择'))+
      App.field('运行间隔（分钟，最小 5）',App.input('taskInterval',item.interval_minutes||60,'','number'))+
      App.field('状态',App.select('taskEnabled',[{value:1,label:'启用'},{value:0,label:'停用'}],item.enabled==null?1:item.enabled));
    App.modal(item.task_id?'编辑边缘任务':'新增边缘任务',body,async function(){var r=await App.req('/cloud/tasks/save',{method:'POST',body:{task_id:item.task_id||0,task_name:App.val('taskName'),task_type:App.val('taskType'),node_id:App.intVal('taskNode'),interval_minutes:App.intVal('taskInterval'),enabled:App.intVal('taskEnabled')}});if(r.code===0){App.closeModal();Views.tasks(host);}else App.toast(r.msg||'保存失败',true);});
  }

  Views.monitor = async function(host){
    host.innerHTML='<div class="toolbar"><button class="action-btn" id="monitorRefresh">刷新检查</button><span class="sub">Worker 不提供主机 CPU、磁盘或 PHP 进程数据；此处检查云端服务绑定和 D1 表可用性。</span></div><div id="monitorBody"><div class="empty">正在检查 D1…</div></div>';
    App.on('monitorRefresh','click',function(){Views.monitor(host);});
    var result=await App.req('/cloud/monitor'),data=result.data||{};
    document.getElementById('monitorBody').innerHTML='<div class="metric-grid">'+metric('D1 数据库',data.d1?'正常':'不可用')+metric('R2 媒体桶',data.r2?'已绑定':'未绑定')+metric('启用任务',data.scheduled_tasks||0)+metric('检查时间',App.fmtTime(data.checked_at))+'</div><div class="admin-card"><div class="card-head"><h3>数据表状态</h3></div><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>表</th><th>记录数</th><th>状态</th></tr></thead><tbody>'+(data.tables||[]).map(function(row){return '<tr><td>'+App.esc(row.table)+'</td><td>'+Number(row.count||0).toLocaleString()+'</td><td>'+(row.healthy?'<span class="tag green">正常</span>':'<span class="tag red">不可用</span> '+App.esc(row.error||''))+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  };
  function metric(label,value){return '<div class="metric-card"><span>'+App.esc(label)+'</span><div class="metric-num">'+App.esc(value)+'</div></div>';}

  Views.transfer = function(host){
    host.innerHTML='<div class="admin-card"><div class="card-head"><h3>MacCMS 内容 JSON 迁移</h3></div><p class="sub">导出每个模型最多 5000 条；导入每次最多 500 条。导入会按内容主键覆盖同 ID 记录，先导出备份再导入。</p><div class="toolbar">'+App.select('transferModel',[{value:'vod',label:'影片'},{value:'art',label:'文章'},{value:'topic',label:'专题'},{value:'manga',label:'漫画'},{value:'actor',label:'明星'},{value:'role',label:'角色'},{value:'website',label:'网址导航'}],'vod')+'<button class="action-btn" id="transferExport">下载 JSON</button><input id="transferFile" type="file" accept="application/json,.json"><button class="btn-create" id="transferImport">导入 JSON</button></div><div id="transferResult" class="sub"></div></div>';
    App.on('transferExport','click',async function(){var model=App.val('transferModel');var response=await fetch('/api/admin/cloud/transfer/'+model+'?limit=5000',{headers:{Authorization:'Bearer '+App.token}});var data=await response.json();var blob=new Blob([JSON.stringify(data.data,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='maccms-'+model+'-export.json';a.click();URL.revokeObjectURL(a.href);});
    App.on('transferImport','click',async function(){var file=document.getElementById('transferFile').files[0];if(!file){App.toast('请选择 JSON 文件',true);return;}try{var parsed=JSON.parse(await file.text());var payload=Array.isArray(parsed)?{rows:parsed}:parsed;var result=await App.req('/cloud/transfer/'+App.val('transferModel'),{method:'POST',body:payload});var target=document.getElementById('transferResult');target.textContent=result.msg||'导入完成';if(result.code!==0)App.toast(result.msg||'导入失败',true);}catch(error){App.toast('JSON 文件无法解析：'+error.message,true);}});
  };

  Views.access = async function(host){
    host.innerHTML='<div class="toolbar"><button class="btn-create" id="accessAdd">+ 新增访问限制</button><span class="sub">规则会拦截会员注册和登录；停用会员账号仍可作为单账号封禁。</span></div><div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>类型</th><th>匹配值</th><th>原因</th><th>到期时间</th><th>创建时间</th><th>操作</th></tr></thead><tbody id="accessRows"></tbody></table></div></div>';
    var result=await App.req('/cloud/access-rules'),rows=result.data||[];
    document.getElementById('accessRows').innerHTML=rows.length?rows.map(function(row){return '<tr><td>'+({ip:'IP',username:'账号',user_id:'会员 ID'}[row.rule_type]||App.esc(row.rule_type))+'</td><td>'+App.esc(row.rule_value)+'</td><td>'+App.esc(row.reason)+'</td><td>'+App.esc(row.expires_at?App.fmtTime(row.expires_at):'永不过期')+'</td><td>'+App.fmtTime(row.created_at)+'</td><td><button class="action-btn del" data-remove="'+row.rule_id+'">解除</button></td></tr>';}).join(''):'<tr><td colspan="6" class="empty">暂无访问限制</td></tr>';
    App.on('accessAdd','click',function(){var body=App.field('限制类型',App.select('accessType',[{value:'ip',label:'IP 地址'},{value:'username',label:'会员账号'},{value:'user_id',label:'会员 ID'}],'ip'))+App.field('匹配值',App.input('accessValue',''))+App.field('原因',App.input('accessReason',''))+App.field('到期时间戳（0 永久）',App.input('accessExpiry','0','','number'));App.modal('新增会员访问限制',body,async function(){var saved=await App.req('/cloud/access-rules',{method:'POST',body:{rule_type:App.val('accessType'),rule_value:App.val('accessValue'),reason:App.val('accessReason'),expires_at:App.intVal('accessExpiry')}});if(saved.code===0){App.closeModal();Views.access(host);}else App.toast(saved.msg||'保存失败',true);});});
    host.querySelectorAll('[data-remove]').forEach(function(button){button.onclick=async function(){await App.req('/cloud/access-rules/'+button.dataset.remove,{method:'DELETE'});Views.access(host);};});
  };

  Views.recycle = async function(host){
    host.innerHTML='<div class="toolbar"><span class="sub">删除影片、文章、专题、漫画、明星、角色和网址会先保存原始数据。仅还原记录可以恢复内容。</span></div><div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>模型</th><th>原记录 ID</th><th>删除人</th><th>删除时间</th><th>操作</th></tr></thead><tbody id="recycleRows"></tbody></table></div><div id="recyclePager"></div></div>';
    renderRecycle(host,1);
  };
  async function renderRecycle(host,page){
    var result=await App.req('/cloud/recycle?page='+page+'&limit=30'),data=result.data||{list:[]},rows=data.list||[],tbody=document.getElementById('recycleRows');if(!tbody)return;
    tbody.innerHTML=rows.length?rows.map(function(row){return '<tr><td>'+App.esc(row.model)+'</td><td>'+row.record_id+'</td><td>'+App.esc(row.deleted_by)+'</td><td>'+App.fmtTime(row.deleted_at)+'</td><td><button class="action-btn" data-restore="'+row.recycle_id+'">还原</button> <button class="action-btn del" data-purge="'+row.recycle_id+'">永久删除</button></td></tr>';}).join(''):'<tr><td colspan="5" class="empty">回收站为空</td></tr>';
    tbody.querySelectorAll('[data-restore]').forEach(function(button){button.onclick=async function(){var restored=await App.req('/cloud/recycle/'+button.dataset.restore+'/restore',{method:'POST',body:{}});App.toast(restored.msg||'已还原');renderRecycle(host,page);};});
    tbody.querySelectorAll('[data-purge]').forEach(function(button){button.onclick=async function(){if(!confirm('永久清除后无法恢复，继续？'))return;await App.req('/cloud/recycle/'+button.dataset.purge,{method:'DELETE'});renderRecycle(host,page);};});
    var pager=document.getElementById('recyclePager');if(pager)pager.innerHTML=App.pager(data,function(next){renderRecycle(host,next);});
  }

  function tableHtml(rows,keys,actions){
    return '<div style="overflow:auto"><table class="data-table"><thead><tr>'+keys.map(function(key){return '<th>'+App.esc(key)+'</th>';}).join('')+(actions?'<th>操作</th>':'')+'</tr></thead><tbody>'+
      (rows.length?rows.map(function(row){return '<tr>'+keys.map(function(key){var value=row[key];if(key.endsWith('_at')||key.endsWith('_time'))value=value?App.fmtTime(value):'';if(typeof value==='string')value=value.slice(0,150);return '<td>'+App.esc(value==null?'':value)+'</td>';}).join('')+(actions?'<td>'+actions(row)+'</td>':'')+'</tr>';}).join(''):'<tr><td colspan="'+(keys.length+(actions?1:0))+'" class="empty">暂无记录</td></tr>')+'</tbody></table></div>';
  }
})(window);
