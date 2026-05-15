# 🦉 企鹅物流果实屯放仓库

洛克王国好友圈果实协调工具。记录大家把什么果实放在了哪个眠枭庇护所，一起搞清楚谁还缺什么精灵～

---

## ✨ 功能一览

- 📅 **多赛季管理** — 不同赛季的异色精灵分开记录，随时切换查看
- 🏕️ **庇护所总览** — 看谁开启了哪个庇护所、每个槽位放了什么精灵
- 🍎 **精灵果实追踪** — 追踪每个人拿到了哪些精灵
- ⭐ **庇护所评价** — 给每个庇护所评分（🔴不要来 / 🟡凑和吧 / 🟢风水宝地）
- 🛡️ **管理员工具** — 管理用户、赛季、庇护所，支持 JSON 批量导入

---

## 🚀 部署教程（保姆级）

### 第一步：准备 Supabase 数据库（免费）

1. 打开 [supabase.com](https://supabase.com)，注册账号并新建一个项目
2. 等项目创建好后（约 1-2 分钟），左侧菜单点 **SQL Editor**
3. 点 **New query**，把下面的内容全部粘贴进去，然后点 **Run**：

```sql
create table if not exists users (
  id text primary key,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  spirits jsonb not null default '[]',
  created_at timestamptz default now()
);
create table if not exists sanctuaries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_fruits int not null default 1 check (max_fruits between 1 and 2),
  created_at timestamptz default now()
);
create table if not exists user_sanctuary (
  user_id text references users(id) on delete cascade,
  sanctuary_id uuid references sanctuaries(id) on delete cascade,
  is_open boolean not null default false,
  primary key (user_id, sanctuary_id)
);
create table if not exists sanctuary_fruits (
  user_id text references users(id) on delete cascade,
  sanctuary_id uuid references sanctuaries(id) on delete cascade,
  season_id uuid references seasons(id) on delete cascade,
  spirit_name text not null,
  slot int not null check (slot between 1 and 2),
  primary key (user_id, sanctuary_id, season_id, slot)
);
create table if not exists user_fruits (
  user_id text references users(id) on delete cascade,
  season_id uuid references seasons(id) on delete cascade,
  spirit_name text not null,
  obtained boolean not null default false,
  primary key (user_id, season_id, spirit_name)
);
create table if not exists sanctuary_ratings (
  user_id text references users(id) on delete cascade,
  sanctuary_id uuid references sanctuaries(id) on delete cascade,
  rating int not null check (rating in (0, 1, 2)),
  primary key (user_id, sanctuary_id)
);
alter table users              disable row level security;
alter table seasons            disable row level security;
alter table sanctuaries        disable row level security;
alter table user_sanctuary     disable row level security;
alter table sanctuary_fruits   disable row level security;
alter table user_fruits        disable row level security;
alter table sanctuary_ratings  disable row level security;
```

4. 看到绿色 **Success** 就完成了！

---

### 第二步：获取 API 密钥

1. 左侧菜单 → **Project Settings** → **API**
2. 复制 **Project URL**（格式：`https://xxxxxx.supabase.co`）
3. 复制 **Project API Keys** 里的 **anon public**（那个长字符串）

---

### 第三步：填写配置文件

打开 `config.js`，把两行占位符替换成刚才复制的内容：

```js
const SUPABASE_URL      = 'https://你的项目ID.supabase.co';
const SUPABASE_ANON_KEY = '你的anon_key';
```

---

### 第四步：上传到 GitHub Pages

1. 在 GitHub 新建一个仓库（名字随意）
2. 把以下文件全部上传到仓库根目录：
   - `index.html`
   - `style.css`
   - `config.js`（记得已填好密钥）
   - `api.js`
   - `auth.js`
   - `app.js`
3. 进入仓库 **Settings → Pages**
4. Source 选 **Deploy from a branch** → 分支选 `main` → 目录选 `/ (root)` → 点 **Save**
5. 等 1-2 分钟，Pages 页面会出现你的网址，点开就能用了！

---

### 第五步：创建第一个账号

第一次打开网站，**直接在注册框注册**，第一个注册的账号会自动成为 **管理员**。

之后管理员：
1. 点 **管理赛季** → 添加当前赛季名称、时间段、异色精灵列表
2. 点 **管理庇护所** → 添加各个眠枭庇护所名称
3. 把网址分享给朋友，让大家注册普通账号开始使用！

---

## 👥 使用说明

| 操作 | 说明 |
|------|------|
| 开启庇护所 | 点庇护所行里的「未开启」按钮，或点「✅ 一键全开」 |
| 放置精灵果实 | 点庇护所里的「+ 槽位」，从当前赛季精灵列表里选一个 |
| 标记精灵已获取 | 在「精灵果实」卡片里点「+ 标记获取」；放置果实时也会自动标记 |
| 评价庇护所 | 每个庇护所底部有评价按钮，再次点击可取消 |
| 切换赛季 | 点页面顶部的赛季标签 |

---

## 🛡️ 管理员专属功能

| 功能 | 入口 |
|------|------|
| 管理用户（注册/升级/删除） | 管理员工具栏 → 管理用户 |
| 管理赛季（新增/编辑/删除） | 管理员工具栏 → 管理赛季 |
| 管理庇护所（新增/编辑/删除） | 管理员工具栏 → 管理庇护所 |
| 批量导入 JSON 数据 | 管理员工具栏 → 导入 JSON |
| 清空庇护所放置记录 | 管理员工具栏 → 🧹 清空庇护所放置 |
| 清空全部用户数据 | 管理员工具栏 → 🗑️ 批量清空全部数据 |

---

## 📦 JSON 导入格式

管理员可以通过「导入 JSON」一次性批量添加赛季和庇护所：

```json
{
  "seasons": [
    {
      "name": "第一赛季",
      "start_date": "2024-01-01",
      "end_date": "2024-03-31",
      "spirits": ["异色火焰犬", "异色冰晶猫", "异色雷鸣鸟"]
    }
  ],
  "sanctuaries": [
    { "name": "北方雪峰庇护所", "max_fruits": 2 },
    { "name": "南方森林庇护所", "max_fruits": 1 }
  ]
}
```

---

## ⚠️ 注意事项

- `config.js` 里的 API key 会随仓库公开。对小圈子工具没问题，但不要把这个 key 用在其他项目里。
- 如果想限制陌生人注册，可以让管理员手动在「管理用户」里创建账号，然后告知密码，无需开放注册入口（目前注册入口无法关闭，后续可按需改动）。
- Supabase 免费版长期不活跃会暂停项目，重新激活即可恢复。
