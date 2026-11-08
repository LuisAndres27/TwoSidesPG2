import { canonical } from './canonical-envelope.js';
import { invalid, conflict, deferred } from './errors.js';

const require = ok => { if (!ok) throw invalid(); };
const same = (a,b) => canonical(a) === canonical(b);
const terminalKinds = ['ANIMAL_DIED','ANIMAL_RESTART_REQUESTED','ANIMAL_SEGMENT_COMPLETED','ANIMAL_SEGMENT_EXITED'];
const p = fact => JSON.parse(fact.canonicalPayload);
export function validateRelations(facts, op, parents) {
  const e = op.envelope, v = e.payload;
  const all = type => facts.filter(f => f.type === type).map(p);
  const hasParent = (type, predicate) => parents.some(f => f.type === type && predicate(p(f)));
  let expected = 0;
  if (e.type === 'game.report') {
    for (const other of all('game.report').filter(g => g.gameId === v.gameId)) {
      const [older,newer] = other.revision < v.revision ? [other,v] : [v,other];
      if (other.revision === v.revision) continue; // Same source key handled by the unique fact check.
      if (['createdAtUtc','rulesVersion','contentVersion','saveFormatVersion'].some(k => older[k] !== newer[k])) throw conflict();
      for (const d of older.decisions) if (!newer.decisions.some(x => x.decisionId === d.decisionId && same(x,d))) throw conflict();
      for (const b of older.biomes) {
        const next = newer.biomes.find(x => x.biomeId === b.biomeId);
        if ({ human_pending:0, animal_pending:1, completed:2 }[next.status] < { human_pending:0, animal_pending:1, completed:2 }[b.status] ||
            (b.result !== null && b.result !== next.result) ||
            ['humanCompletedAtUtc','animalCompletedAtUtc'].some(k => b[k] !== null && b[k] !== next[k])) throw conflict();
      }
      if (['ending','endingRulesVersion','preparedAtUtc','closedAtUtc'].some(k => older[k] !== null && older[k] !== newer[k])) throw conflict();
      if ((older.status === 'completed' && !['completed','archived'].includes(newer.status)) ||
          (older.status === 'final_pending' && newer.status === 'in_progress') ||
          (['completed','archived'].includes(older.status) && newer.isCurrent)) throw conflict();
    }
  } else {
    const sessionId = v.sessionId;
    const open = all('session.report').find(s => s.sessionId === sessionId && s.phase === 'open');
    const end = all('session.report').find(s => s.sessionId === sessionId && s.phase === 'terminal');
    if (e.type === 'session.report' && v.phase === 'open') {
      if (end && end.startedAtUtc !== v.startedAtUtc) throw conflict();
    } else {
      expected++;
      if (!open) throw deferred();
      require(hasParent('session.report', s => s.sessionId === sessionId && s.phase === 'open'));
      if (e.type === 'session.report') {
        require(open.startedAtUtc === v.startedAtUtc);
        require(all('gameplay.event').filter(x => x.sessionId === sessionId).every(x => x.offsetMs <= v.endOffsetMs));
        require(all('gameplay.interval').filter(x => x.sessionId === sessionId).every(x => x.endMs <= v.endOffsetMs));
      } else {
        if (end) require((e.type === 'gameplay.event' ? v.offsetMs : v.endMs) <= end.endOffsetMs);
        if (v.gameId !== null) {
          expected++;
          require(hasParent('game.report', g => g.gameId === v.gameId));
        }
        if (v.animalRunId !== null) {
          const events = all('gameplay.event').filter(x => x.animalRunId === v.animalRunId);
          const isStart = e.type === 'gameplay.event' && v.kind === 'ANIMAL_SEGMENT_STARTED';
          const start = events.find(x => x.kind === 'ANIMAL_SEGMENT_STARTED');
          if (!isStart) {
            expected++; if (!start) throw deferred();
            require(hasParent('gameplay.event', x => x.kind === 'ANIMAL_SEGMENT_STARTED' && x.eventId === v.animalRunId));
            require(start.sessionId === sessionId && start.gameId === v.gameId && start.biomeId === v.biomeId && (v.offsetMs ?? v.startMs) >= start.offsetMs);
          }
          if (e.type === 'gameplay.event') {
            if (events.some(x => x.kind === v.kind)) throw conflict();
            if (isStart) require(parents.some(f => f.type === 'game.report' && p(f).decisions.some(d => d.biomeId === v.biomeId)));
            const combined = [...events,v];
            const primary = combined.filter(x => ['ANIMAL_DIED','ANIMAL_RESTART_REQUESTED','ANIMAL_SEGMENT_COMPLETED'].includes(x.kind));
            if (primary.length > 1) throw conflict();
            const retry = combined.find(x => x.kind === 'ANIMAL_RETRY_REQUESTED');
            const died = combined.find(x => x.kind === 'ANIMAL_DIED');
            const exit = combined.find(x => x.kind === 'ANIMAL_SEGMENT_EXITED');
            if (retry && !died) throw deferred();
            require(!retry || (retry.offsetMs >= died.offsetMs && (!exit || exit.offsetMs >= retry.offsetMs)));
            require(!exit || primary.every(x => exit.offsetMs >= x.offsetMs));
            if (v.kind === 'ANIMAL_SEGMENT_COMPLETED' && !all('game.report').some(g => g.gameId === v.gameId && g.biomes.some(b => b.biomeId === v.biomeId && b.status === 'completed'))) throw deferred();
            if (terminalKinds.includes(v.kind)) require(all('gameplay.interval').filter(i => i.animalRunId === v.animalRunId && i.state === 'ActiveAnimal').every(i => i.endMs <= v.offsetMs));
          } else if (v.state === 'ActiveAnimal') require(events.filter(x => terminalKinds.includes(x.kind)).every(x => v.endMs <= x.offsetMs));
        }
        if (e.type === 'gameplay.interval') {
          for (const old of all('gameplay.interval').filter(i => i.sessionId === sessionId)) {
            if ((old.startMs === v.startMs && old.endMs === v.endMs && old.state === v.state) ||
                (v.endMs > v.startMs && old.endMs > old.startMs && old.startMs < v.endMs && old.endMs > v.startMs)) throw conflict('interval_overlap');
          }
        }
      }
    }
  }
  require(parents.length === expected);
}
