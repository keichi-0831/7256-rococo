// api.js — 数据库操作层（Supabase）
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const API = {

  // ── 用户 ────────────────────────────────────────
  async getUser(id, passwordHash) {
    const { data } = await db.from('users')
      .select('id, role')
      .eq('id', id)
      .eq('password_hash', passwordHash)
      .single();
    return data || null;
  },

  async getUsersCount() {
    const { count, error } = await db
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return count;
  },

  async checkUserExists(id) {
    const { data } = await db.from('users').select('id').eq('id', id).single();
    return !!data;
  },

  async getAllUsers() {
    const { data } = await db.from('users').select('id, role').order('id');
    return data || [];
  },

  async createUser(id, passwordHash, role = 'user') {
    const { error } = await db.from('users').insert({ id, password_hash: passwordHash, role });
    if (error) throw new Error(error.message);
  },

  async deleteUser(id) {
    const { error } = await db.from('users').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async updateUserRole(id, role) {
    const { error } = await db.from('users').update({ role }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── 赛季 ────────────────────────────────────────
  async getSeasons() {
    const { data } = await db.from('seasons').select('*').order('start_date', { ascending: false });
    return data || [];
  },

  async createSeason(name, startDate, endDate, spirits) {
    const { error } = await db.from('seasons').insert({ name, start_date: startDate, end_date: endDate, spirits });
    if (error) throw new Error(error.message);
  },

  async deleteSeason(id) {
    const { error } = await db.from('seasons').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── 庇护所 ──────────────────────────────────────
  async getSanctuaries() {
    const { data } = await db.from('sanctuaries').select('*').order('created_at', { ascending: true });
    return data || [];
  },

  async updateSeason(id, updates) {
    const { error } = await db.from('seasons').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async createSanctuary(name, maxFruits, location = '风眠省', mapImageUrl = '') {
    const { error } = await db.from('sanctuaries').insert({ name, max_fruits: maxFruits, location, map_image_url: mapImageUrl });
    if (error) throw new Error(error.message);
  },

  async updateSanctuary(id, updates) {
    const { error } = await db.from('sanctuaries').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteSanctuary(id) {
    const { error } = await db.from('sanctuaries').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── 庇护所开启状态 ───────────────────────────────
  async getUserSanctuaryStatuses() {
    const { data } = await db.from('user_sanctuary').select('*');
    return data || [];
  },

  async upsertSanctuaryStatus(userId, sanctuaryId, isOpen) {
    const { error } = await db.from('user_sanctuary').upsert(
      { user_id: userId, sanctuary_id: sanctuaryId, is_open: isOpen },
      { onConflict: 'user_id,sanctuary_id' }
    );
    if (error) throw new Error(error.message);
  },

  // ── 庇护所果实放置 ───────────────────────────────
  async getSanctuaryFruits(seasonId) {
    const { data } = await db.from('sanctuary_fruits').select('*').eq('season_id', seasonId);
    return data || [];
  },

  async upsertSanctuaryFruit(userId, sanctuaryId, seasonId, spiritName, slot) {
    const { error } = await db.from('sanctuary_fruits').upsert(
      { user_id: userId, sanctuary_id: sanctuaryId, season_id: seasonId, spirit_name: spiritName, slot },
      { onConflict: 'user_id,sanctuary_id,season_id,slot' }
    );
    if (error) throw new Error(error.message);
  },

  async deleteSanctuaryFruit(userId, sanctuaryId, seasonId, slot) {
    const { error } = await db.from('sanctuary_fruits')
      .delete()
      .eq('user_id', userId).eq('sanctuary_id', sanctuaryId)
      .eq('season_id', seasonId).eq('slot', slot);
    if (error) throw new Error(error.message);
  },

  // ── 精灵果实获取记录 ─────────────────────────────
  async getUserFruits(seasonId) {
    const { data } = await db.from('user_fruits').select('*').eq('season_id', seasonId);
    return data || [];
  },

  async upsertUserFruit(userId, seasonId, spiritName, obtained) {
    const { error } = await db.from('user_fruits').upsert(
      { user_id: userId, season_id: seasonId, spirit_name: spiritName, obtained },
      { onConflict: 'user_id,season_id,spirit_name' }
    );
    if (error) throw new Error(error.message);
  },

  // ── 庇护所评价 ──────────────────────────────────
  async getSanctuaryRatings() {
    const { data } = await db.from('sanctuary_ratings').select('*');
    return data || [];
  },

  async upsertSanctuaryRating(userId, sanctuaryId, rating, comment = '') {
    const { error } = await db.from('sanctuary_ratings').upsert(
      { user_id: userId, sanctuary_id: sanctuaryId, rating, comment },
      { onConflict: 'user_id,sanctuary_id' }
    );
    if (error) throw new Error(error.message);
  },

  async deleteSanctuaryRating(userId, sanctuaryId) {
    const { error } = await db.from('sanctuary_ratings')
      .delete().eq('user_id', userId).eq('sanctuary_id', sanctuaryId);
    if (error) throw new Error(error.message);
  },

  // ── 管理员：批量清空 ─────────────────────────────
  async clearSanctuaryFruits(seasonId) {
    if (seasonId) {
      await db.from('sanctuary_fruits').delete().eq('season_id', seasonId);
    } else {
      await db.from('sanctuary_fruits').delete().not('user_id', 'is', null);
    }
  },

  async clearAllUserData() {
    await db.from('sanctuary_fruits').delete().not('user_id', 'is', null);
    await db.from('user_sanctuary').delete().not('user_id', 'is', null);
    await db.from('user_fruits').delete().not('user_id', 'is', null);
  },

  async clearSeasonUserData(seasonId) {
    await db.from('sanctuary_fruits').delete().eq('season_id', seasonId);
    await db.from('user_fruits').delete().eq('season_id', seasonId);
  },

  // ── 精灵数据库 ──────────────────────────────────
  async getSpirits() {
    const { data } = await db.from('spirits').select('*').order('created_at', { ascending: true });
    return data || [];
  },

  async createSpirit(name, element = '') {
    const { error } = await db.from('spirits').insert({ name, element });
    if (error) throw new Error(error.message);
  },

  async updateSpirit(id, updates) {
    const { error } = await db.from('spirits').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteSpirit(id) {
    const { error } = await db.from('spirits').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // name 冲突时更新 element（upsert by name）
  async importSpirits(list) {
    for (const s of list) {
      const { error } = await db.from('spirits').upsert(
        { name: s.name, element: s.element || '' },
        { onConflict: 'name' }
      );
      if (error) throw new Error(error.message);
    }
  },
};
