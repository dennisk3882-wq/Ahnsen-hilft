'use strict';

const profileStore = require('./extended-storage');
const phase10 = require('./phase10-storage');
const { LEVEL_SIZE } = require('./progression');

let patched = false;

function progressionWithBonus(stats, bonusXp = 0) {
  if (!stats) return stats;
  const baseXp = Math.max(0, Number(stats.xp || 0));
  const bonus = Math.max(0, Number(bonusXp || 0));
  const xp = baseXp + bonus;
  const level = Math.floor(xp / LEVEL_SIZE) + 1;
  const xpIntoLevel = xp % LEVEL_SIZE;
  const title = level >= 20 ? 'Quiz-Legende'
    : level >= 12 ? 'Wissens-Champion'
      : level >= 7 ? 'Quiz-Profi'
        : level >= 3 ? 'Wissenssammler'
          : 'Quiz-Neuling';
  return {
    ...stats,
    baseXp,
    bonusXp: bonus,
    xp,
    level,
    levelSize: LEVEL_SIZE,
    xpIntoLevel,
    xpForNextLevel: LEVEL_SIZE - xpIntoLevel,
    progressPercent: Math.round(xpIntoLevel / LEVEL_SIZE * 100),
    title,
  };
}

function rewardAchievements(stats, rewards) {
  const badges = Array.isArray(rewards?.badges) ? rewards.badges : [];
  const extra = badges.map(id => ({
    id: `phase10-${id}`,
    icon: id.includes('tournament') ? 'trophy' : id.includes('weekly') || id.includes('monthly') ? 'calendar' : 'medal',
    title: id.includes('tournament') ? 'Turnier-Champion' : id.includes('weekly') ? 'Quiz der Woche' : id.includes('monthly') ? 'Monats-Champion' : 'Duell-Sieger',
    text: id.includes('tournament') ? 'Ein K.-o.-Turnier gewonnen.' : id.includes('weekly') ? 'Das offizielle Quiz der Woche abgeschlossen.' : id.includes('monthly') ? 'Die offizielle Monats-Challenge abgeschlossen.' : 'Eine Freundesduell-Serie gewonnen.',
  }));
  const existing = Array.isArray(stats.achievements) ? stats.achievements : [];
  return [...existing, ...extra.filter(item => !existing.some(existingItem => existingItem.id === item.id))];
}

function patchProgression() {
  if (patched) return;
  patched = true;

  const originalStats = profileStore.getProfileStats.bind(profileStore);
  profileStore.getProfileStats = async profileId => {
    const stats = await originalStats(profileId);
    if (!stats) return stats;
    const rewards = await phase10.profileRewards(profileId).catch(() => ({ bonus_xp: 0, badges: [] }));
    const enriched = progressionWithBonus(stats, rewards.bonus_xp);
    enriched.achievements = rewardAchievements(enriched, rewards);
    enriched.phase10Rewards = { bonusXp: Number(rewards.bonus_xp || 0), badges: rewards.badges || [] };
    return enriched;
  };

  const originalLeaderboard = profileStore.getLeaderboard.bind(profileStore);
  profileStore.getLeaderboard = async limit => {
    const entries = await originalLeaderboard(Math.max(100, Number(limit) || 50));
    const enriched = await Promise.all(entries.map(async entry => {
      const rewards = await phase10.profileRewards(entry.id).catch(() => ({ bonus_xp: 0 }));
      return progressionWithBonus(entry, rewards.bonus_xp);
    }));
    return enriched.sort((a, b) => b.xp - a.xp || b.points - a.points || b.accuracy - a.accuracy || a.name.localeCompare(b.name, 'de'))
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 50)))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  };
}

module.exports = { patchProgression, _test: { progressionWithBonus, rewardAchievements } };
