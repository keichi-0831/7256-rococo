// auth.js — 登录、注册、会话管理
const Auth = {
  KEY: 'pf_session',

  hashPassword(pw) {
    return sha256(pw);   // 来自 js-sha256 CDN
  },

  async login(id, password) {
    return await API.getUser(id, this.hashPassword(password));
  },

  async register(id, password, role = 'user') {
    if (!id.trim()) throw new Error('ID 不能为空');
    if (password.length < 6) throw new Error('密码至少需要 6 位');
    const exists = await API.checkUserExists(id.trim());
    if (exists) throw new Error('这个 ID 已经被注册了，换一个试试~');
    await API.createUser(id.trim(), this.hashPassword(password), role);
    return await API.getUser(id.trim(), this.hashPassword(password));
  },

  saveSession(user) {
    localStorage.setItem(this.KEY, JSON.stringify({ id: user.id, role: user.role }));
  },

  loadSession() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; }
  },

  logout() {
    localStorage.removeItem(this.KEY);
  }
};
