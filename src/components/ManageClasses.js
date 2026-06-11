import React, { useEffect, useState } from 'react';
import { KeyRound, GraduationCap, LockKeyhole, Trash2, MoveRight, X, Copy, Mail } from 'lucide-react';
import {
  createJoinCode,
  getClassStructure,
  getJoinCodes,
  getRoster,
  removeStudent,
  resetStudentPassword,
  setJoinCodeActive,
  updateClassStructure,
  updateStudentPlacement,
} from '../api/auth';
// DEV ONLY - MOCK DATA - REMOVE BEFORE DEPLOY
import { MOCK_DATA_ENABLED, MOCK_CLASS_STRUCTURE, MOCK_ROSTER, MOCK_JOIN_CODES } from '../constants/mockTeacher';
import { MOCK_MEASUREMENTS } from '../constants/mockMeasurements';
import ConfirmDialog from './ConfirmDialog';

export default function ManageClasses({
  workspaceId,
  theme,
  onGroupSelect,
  viewerProfile,
  onClassStructureChanged,
}) {
  const [members, setMembers] = useState([]);
  const [joinCodes, setJoinCodes] = useState([]);
  const [newCode, setNewCode] = useState('');
  const [newCodePeriod, setNewCodePeriod] = useState('P3'); // period a newly created code joins to
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteSent, setInviteSent] = useState(0);
  const [error, setError] = useState('');
  const [activeStudent, setActiveStudent] = useState(null);
  const [activeAction, setActiveAction] = useState('');
  const [draftPassword, setDraftPassword] = useState('');
  const [draftPeriod, setDraftPeriod] = useState('P1');
  const [draftGroup, setDraftGroup] = useState('G1');
  const [busy, setBusy] = useState(false);
  const [periodCount, setPeriodCount] = useState(1);
  const [groupCount, setGroupCount] = useState(6);
  // Actual period/group labels (e.g. P3, P5) when known; falls back to P1..Pn / G1..Gn.
  const [periodLabels, setPeriodLabels] = useState(null);
  const [groupLabels, setGroupLabels] = useState(null);
  // Section 3: default visibility for new uploads/classes (public | school | group).
  const [defaultVisibility, setDefaultVisibility] = useState('group');
  const [copiedCode, setCopiedCode] = useState('');
  // Section 4/5/6 state
  const [shrink, setShrink] = useState(null); // { blockers:[{period,group,accounts,sessions}], hasMembers } | null
  const [removeTarget, setRemoveTarget] = useState(null); // account pending removal
  const [rosterPeriod, setRosterPeriod] = useState('all');
  const [showHelp, setShowHelp] = useState(false);

  const generateRandomCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(
      { length: 5 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join('');
    setNewCode(code);
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard may be unavailable (e.g. non-secure context); ignore
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((c) => (c === code ? '' : c)), 1500);
  };

  const load = async () => {
    // DEV ONLY - MOCK DATA: populate from the teacher mock when there's no backend.
    if (MOCK_DATA_ENABLED) {
      setMembers(MOCK_ROSTER);
      setJoinCodes(MOCK_JOIN_CODES);
      setPeriodCount(MOCK_CLASS_STRUCTURE.periods.length);
      setGroupCount(MOCK_CLASS_STRUCTURE.groupsPerPeriod);
      setPeriodLabels(MOCK_CLASS_STRUCTURE.periods);
      setGroupLabels(MOCK_CLASS_STRUCTURE.groups);
      setDefaultVisibility(MOCK_CLASS_STRUCTURE.defaultVisibility || 'group');
      setError('');
      return;
    }
    if (!workspaceId) return;
    try {
      const [roster, codes, structure] = await Promise.all([
        getRoster(workspaceId),
        getJoinCodes(workspaceId),
        getClassStructure(workspaceId),
      ]);
      setMembers(roster.members || []);
      setJoinCodes(codes.joinCodes || []);
      setPeriodCount(structure.periodCount || 1);
      setGroupCount(structure.groupCount || 4);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load class management data.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);


  const doSaveStructure = async () => {
    const np = Number(periodCount);
    const ng = Number(groupCount);
    if (MOCK_DATA_ENABLED) {
      // Dev: apply locally, keeping named periods/groups (drop the trimmed tail).
      // TODO(period-rename): adding/renaming periods needs explicit names, not just counts —
      // teachers think in P3/P5, not P1..Pn. The count input grows/shrinks; renaming is future work.
      setPeriodLabels((prev) => (prev || savedPeriods).slice(0, np));
      setGroupLabels((prev) => (prev || savedGroups).slice(0, ng));
      setError('');
      return;
    }
    try {
      setBusy(true);
      const updated = await updateClassStructure(workspaceId, { periodCount: np, groupCount: ng });
      setPeriodCount(updated.periodCount || np);
      setGroupCount(updated.groupCount || ng);
      setError('');
      onClassStructureChanged?.(updated);
    } catch (e) {
      setError(e.message || 'Failed to update class structure.');
    } finally {
      setBusy(false);
    }
  };

  // Section 4: block shrinking out a period/group that still has accounts or sessions.
  const handleSaveClassStructure = () => {
    const keptPeriods = savedPeriods.slice(0, Number(periodCount));
    const keptGroups = savedGroups.slice(0, Number(groupCount));
    const blockers = [];
    savedPeriods.forEach((p) => savedGroups.forEach((g) => {
      if (keptPeriods.includes(p) && keptGroups.includes(g)) return;
      const acc = accountsByGroup[`${p} ${g}`] || 0;
      const sess = sessionsByGroup[`${p} ${g}`] || 0;
      if (acc > 0 || sess > 0) blockers.push({ period: p, group: g, accounts: acc, sessions: sess });
    }));
    if (blockers.length === 0) { doSaveStructure(); return; }
    setShrink({ blockers, hasMembers: blockers.some((b) => b.accounts > 0) });
  };

  const shareCode = (period) => {
    const code = joinCodes.find((c) => c.period === period && c.active) || joinCodes.find((c) => c.period === period);
    if (code) copyCode(code.code);
  };

  const doRemoveStudent = async (student) => {
    if (!student) return;
    if (MOCK_DATA_ENABLED) {
      setMembers((prev) => prev.filter((m) => m.id !== student.id));
      setRemoveTarget(null);
      return;
    }
    try {
      setBusy(true);
      await removeStudent(workspaceId, student.id);
      await load();
      setRemoveTarget(null);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to remove student.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCode = async () => {
    const code = newCode.trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      setError('Join code must be exactly 5 letters/numbers.');
      return;
    }
    // School + teacher are fixed class context (from My Page / profile), not per-code inputs.
    if (MOCK_DATA_ENABLED) {
      setJoinCodes((prev) => [
        { id: `jc-${code}`, code, period: newCodePeriod, school_code: viewerProfile?.school || '', instructor: viewerProfile?.instructor || '', active: true, created_at: new Date().toISOString().slice(0, 10) },
        ...prev,
      ]);
      setNewCode('');
      setError('');
      return;
    }
    try {
      const created = await createJoinCode(workspaceId, {
        code,
        schoolCode: viewerProfile?.school || '',
        instructor: viewerProfile?.instructor || '',
        active: true,
      });
      setJoinCodes((prev) => [created.joinCode, ...prev]);
      setNewCode('');
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to create join code.');
    }
  };

  // Frontend-only invite: mock success. TODO(backend): invitation endpoint that emails each
  // address an invitation carrying the class join code (with an email template).
  const handleInvite = () => {
    const emails = inviteEmails.split(/[\s,]+/).map((e) => e.trim()).filter((e) => e.includes('@'));
    setInviteSent(emails.length);
  };

  const handleToggleCode = async (code) => {
    if (MOCK_DATA_ENABLED) {
      setJoinCodes((prev) => prev.map((c) => (c.id === code.id ? { ...c, active: !c.active } : c)));
      return;
    }
    try {
      const updated = await setJoinCodeActive(workspaceId, code.id, !code.active);
      setJoinCodes((prev) => prev.map((c) => (c.id === code.id ? updated.joinCode : c)));
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to update join code.');
    }
  };

  const handleResetPassword = async (student) => {
    if (!draftPassword) return;
    if (MOCK_DATA_ENABLED) {
      setDraftPassword('');
      setActiveStudent(null);
      setActiveAction('');
      // eslint-disable-next-line no-alert
      alert(`Password reset for ${student.full_name} (mock)`);
      return;
    }
    try {
      setBusy(true);
      await resetStudentPassword(workspaceId, student.id, draftPassword);
      setDraftPassword('');
      setActiveStudent(null);
      setActiveAction('');
      setError('');
      // eslint-disable-next-line no-alert
      alert(`Password reset for ${student.full_name}`);
    } catch (e) {
      setError(e.message || 'Failed to reset student password.');
    } finally {
      setBusy(false);
    }
  };

  const openStudentAction = (student, action) => {
    setActiveStudent(student);
    setActiveAction(action);
    setDraftPassword('');
    setDraftPeriod(student.period || 'P1');
    setDraftGroup(student.group_code || 'G1');
  };

  const handleMoveStudent = async () => {
    if (!activeStudent) return;
    if (MOCK_DATA_ENABLED) {
      setMembers((prev) => prev.map((m) => (m.id === activeStudent.id ? { ...m, period: draftPeriod, group_code: draftGroup } : m)));
      setActiveStudent(null);
      setActiveAction('');
      return;
    }
    try {
      setBusy(true);
      await updateStudentPlacement(workspaceId, activeStudent.id, { period: draftPeriod, groupCode: draftGroup });
      await load();
      setActiveStudent(null);
      setActiveAction('');
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to move student.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveStudent = async () => {
    if (!activeStudent) return;
    try {
      setBusy(true);
      await removeStudent(workspaceId, activeStudent.id);
      await load();
      setActiveStudent(null);
      setActiveAction('');
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to remove student.');
    } finally {
      setBusy(false);
    }
  };

  // Section 2: Class overview — derived from the SAVED structure + roster (not the draft inputs).
  const savedPeriods = (periodLabels && periodLabels.length)
    ? periodLabels
    : Array.from({ length: periodCount || 1 }, (_, i) => `P${i + 1}`);
  const savedGroups = (groupLabels && groupLabels.length)
    ? groupLabels
    : Array.from({ length: groupCount || 4 }, (_, i) => `G${i + 1}`);
  const studentMembers = members.filter((m) => m.role === 'student');
  const accountsByGroup = {};
  studentMembers.forEach((m) => {
    const key = `${m.period} ${m.group_code}`;
    accountsByGroup[key] = (accountsByGroup[key] || 0) + 1;
  });
  const totalGroupSlots = savedPeriods.length * savedGroups.length;
  let coveredGroups = 0;
  savedPeriods.forEach((p) => savedGroups.forEach((g) => {
    if (accountsByGroup[`${p} ${g}`] > 0) coveredGroups += 1;
  }));
  const coverageWarn = coveredGroups < totalGroupSlots;
  const schoolCode = viewerProfile?.school || '—';
  const teacherName = viewerProfile?.instructor || MOCK_CLASS_STRUCTURE.teacher || '—';

  // Sessions per (period, group) for THIS teacher's class — feeds shrink protection (Section 4).
  const sessionsByGroup = {};
  if (MOCK_DATA_ENABLED) {
    MOCK_MEASUREMENTS.forEach((s) => {
      if (s.instructor !== viewerProfile?.instructor) return;
      const key = `${s.period} ${s.group}`;
      sessionsByGroup[key] = (sessionsByGroup[key] || 0) + 1;
    });
  }

  // Roster rows: one per (period, group) in the saved structure, filtered by the period filter (Section 5).
  const rosterRows = [];
  savedPeriods.forEach((period) => {
    if (rosterPeriod !== 'all' && rosterPeriod !== period) return;
    savedGroups.forEach((group) => {
      const accts = studentMembers.filter((m) => m.period === period && m.group_code === group);
      rosterRows.push({ period, group, accts });
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">Manage Classes</h1>
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 text-gray-500 text-sm font-bold leading-none hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="Teacher workflow"
              aria-label="Teacher workflow help"
            >
              ?
            </button>
          </div>
          <p className="text-gray-600">Teacher controls for groups, join codes, and student access</p>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Row 1: Class Overview (left) + Class Structure (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Class Overview — current saved state (read-only) */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${theme.bg} rounded-lg flex items-center justify-center`}>
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Class Overview</h3>
              <p className="text-xs text-gray-500">Current saved structure</p>
            </div>
          </div>
          <span className="text-xs text-gray-400 text-right">School changes live in My Page</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500">School · Teacher</p>
            <p className="text-lg font-bold text-gray-900">{schoolCode}</p>
            <p className="text-sm font-medium text-gray-600">{teacherName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Periods</p>
            <p className="text-lg font-bold text-gray-900">{savedPeriods.length}</p>
            <p className="text-xs text-gray-400">{savedPeriods.join(', ') || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Groups / period</p>
            <p className="text-lg font-bold text-gray-900">{savedGroups.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Members joined</p>
            <p className="text-lg font-bold text-gray-900">{studentMembers.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Group coverage</p>
            <p className={`text-lg font-bold ${coverageWarn ? 'text-amber-600' : 'text-green-700'}`}>
              {coveredGroups} of {totalGroupSlots}
            </p>
            {coverageWarn && <p className="text-xs text-amber-600">Some groups have no account</p>}
          </div>
        </div>
      </div>

        {/* Class Structure */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 ${theme.bg} rounded-lg flex items-center justify-center`}>
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Class Structure</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Period count</label>
              <input
                type="number"
                min={1}
                max={12}
                value={periodCount}
                onChange={(e) => setPeriodCount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Groups per period</label>
              <input
                type="number"
                min={1}
                max={12}
                value={groupCount}
                onChange={(e) => setGroupCount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              {/* TODO(backend): persist default visibility. Enum public|school|group, set at
                  upload by the app; 'class'/'me' reserved for a future researcher mode. */}
              <label className="block text-xs text-gray-500 mb-1">Default visibility</label>
              <select
                value={defaultVisibility}
                onChange={(e) => setDefaultVisibility(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="group">Group only</option>
                <option value="school">School only</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
          <button
            disabled={busy}
            onClick={handleSaveClassStructure}
            className={`${theme.bg} ${theme.hover} text-white rounded-lg px-4 py-2 disabled:opacity-60`}
          >
            Save Structure
          </button>
          <p className="text-xs text-gray-500 mt-3">
            Student sign-up period/group options follow this structure. New uploads default to the selected visibility.
          </p>
        </div>
      </div>

      {/* Row 2: Student Join Codes — full width */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 ${theme.bg} rounded-lg flex items-center justify-center`}>
            <KeyRound className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Student Join Codes</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="5-char code"
            maxLength={5}
            className="px-3 py-2 border border-gray-300 rounded-lg w-32 font-mono"
          />
          <select
            value={newCodePeriod}
            onChange={(e) => setNewCodePeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {savedPeriods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            onClick={generateRandomCode}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Regenerate
          </button>
          <button
            onClick={handleCreateCode}
            className={`${theme.bg} ${theme.hover} text-white rounded-lg px-3 py-2 text-sm`}
          >
            Create code
          </button>
        </div>
        <div className="space-y-2">
          {joinCodes.map((code) => (
            <div key={code.id} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 font-mono">{code.code}</p>
                  <p className="text-xs text-gray-500">
                    {code.period ? `Period ${code.period}` : ''}{code.school_code ? ` · ${code.school_code}` : ''}{code.instructor ? ` · ${code.instructor}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyCode(code.code)}
                    title="Copy code"
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200"
                  >
                    {copiedCode === code.code
                      ? <span className="text-xs text-green-600 font-medium px-0.5">Copied</span>
                      : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleToggleCode(code)}
                    className={`px-3 py-1 rounded text-xs font-semibold ${code.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}
                  >
                    {code.active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Students enter this code when creating an account — joins them to {code.period || 'this class'}.
              </p>
            </div>
          ))}
          {!joinCodes.length && (
            <p className="text-sm text-gray-500">No join codes yet — create one above.</p>
          )}
        </div>
      </div>

      {/* Row 3: Class Roster — flat people list (actions live here) */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${theme.bg} rounded-lg flex items-center justify-center`}>
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Class Roster</h3>
              <p className="text-xs text-gray-500">Everyone who joined with the class code.</p>
            </div>
          </div>
          <button
            onClick={() => { setInviteOpen(true); setInviteEmails(''); setInviteSent(0); }}
            className={`${theme.bg} ${theme.hover} text-white rounded-lg px-4 py-2 text-sm inline-flex items-center gap-2`}
          >
            <Mail className="w-4 h-4" />
            Invite student
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4">Joined</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {studentMembers.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {m.full_name ? m.full_name : <span className="text-gray-400 italic">{m.username}</span>}
                  </td>
                  <td className="py-3 pr-4 text-gray-600 font-mono text-xs">{m.username}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{m.period} · {m.group_code}</td>
                  <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{m.joined_at}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openStudentAction(m, 'password')} title="Reset password" className="px-2 py-1.5 rounded text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center gap-1"><LockKeyhole className="w-3.5 h-3.5" />PW</button>
                      <button onClick={() => openStudentAction(m, 'move')} title="Move period/group" className="px-2 py-1.5 rounded text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 inline-flex items-center gap-1"><MoveRight className="w-3.5 h-3.5" />Move</button>
                      <button onClick={() => setRemoveTarget(m)} title="Remove account" className="px-2 py-1.5 rounded text-xs bg-red-50 text-red-700 hover:bg-red-100 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
              {studentMembers.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">No students yet — share a join code.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: Groups — composition & coverage (no member actions; those live in the Roster) */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${theme.bg} rounded-lg flex items-center justify-center`}>
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Groups</h3>
              <p className="text-xs text-gray-500">Composition &amp; coverage — every group needs ≥1 working account.</p>
            </div>
          </div>
          <select
            value={rosterPeriod}
            onChange={(e) => setRosterPeriod(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
          >
            <option value="all">All periods</option>
            {savedPeriods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4">Coverage</th>
                <th className="py-2">Members</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rosterRows.map(({ period, group, accts }) => (
                <tr key={`${period}-${group}`} className="align-top">
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <p className="font-semibold text-gray-900">{period} · {group}</p>
                    <button
                      onClick={() => onGroupSelect?.({ period, group })}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Open Raw Data →
                    </button>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${accts.length === 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                      {accts.length === 0 ? 'No account' : `${accts.length} account${accts.length === 1 ? '' : 's'}`}
                    </span>
                  </td>
                  <td className="py-3">
                    {accts.length === 0 ? (
                      <button
                        onClick={() => shareCode(period)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Share code
                      </button>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {accts.map((a) => (
                          <span key={a.id} className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs">
                            {a.full_name || a.username}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeStudent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !busy && setActiveStudent(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-gray-900">
                  {activeAction === 'password' && 'Reset Password'}
                  {activeAction === 'move' && 'Move Student'}
                  {activeAction === 'delete' && 'Remove Student'}
                </h4>
                <p className="text-xs text-gray-500 mt-1">{activeStudent.full_name} • {activeStudent.email}</p>
              </div>
              <button
                onClick={() => !busy && setActiveStudent(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              {activeAction === 'password' && (
                <div className="space-y-3">
                  <input
                    type="password"
                    value={draftPassword}
                    onChange={(e) => setDraftPassword(e.target.value)}
                    placeholder="New password (8+ chars)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    disabled={busy || draftPassword.length < 8}
                    onClick={() => handleResetPassword(activeStudent)}
                      className="px-3 py-1.5 rounded text-sm bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                    Apply Password
                  </button>
                </div>
              )}
              {activeAction === 'move' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={draftPeriod}
                      onChange={(e) => setDraftPeriod(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {savedPeriods.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select
                      value={draftGroup}
                      onChange={(e) => setDraftGroup(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {savedGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <button
                    disabled={busy}
                    onClick={handleMoveStudent}
                    className="px-3 py-1.5 rounded text-sm bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    Move Student
                  </button>
                </div>
              )}
              {activeAction === 'delete' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">
                    Remove this student from the class roster?
                  </p>
                  <button
                    disabled={busy}
                    onClick={handleRemoveStudent}
                    className="px-3 py-1.5 rounded text-sm bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    Remove Student
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite students modal — frontend + mock success only */}
      {inviteOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setInviteOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h4 className="font-bold text-gray-900">Invite students</h4>
              <button onClick={() => setInviteOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {inviteSent > 0 ? (
                <p className="text-sm text-green-700">
                  Sent {inviteSent} invitation{inviteSent === 1 ? '' : 's'} carrying the class join code. (Mock — no email actually sent.)
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-500">
                    Enter one or more email addresses (comma- or newline-separated). Each gets an invitation email with your class join code.
                  </p>
                  <textarea
                    value={inviteEmails}
                    onChange={(e) => setInviteEmails(e.target.value)}
                    rows={3}
                    placeholder="student@example.com, student2@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  {/* TODO(backend): invitation endpoint + email template carrying the join code. */}
                  <button
                    onClick={handleInvite}
                    className={`${theme.bg} ${theme.hover} text-white rounded-lg px-4 py-2 text-sm`}
                  >
                    Send invitations
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section 6: Teacher Workflow help (behind the ? icon by the title) */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className={`${theme.bg} text-white p-5 rounded-t-2xl flex items-center justify-between`}>
              <h3 className="text-lg font-bold">Teacher Workflow</h3>
              <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="p-6 text-sm text-gray-700 space-y-2 list-disc ml-4">
              <li>Create and share join codes with students for signup.</li>
              <li>Open a group&apos;s Raw Data from the Groups section; manage individual members in the Roster.</li>
              <li>Reset student passwords when needed (teacher support flow).</li>
              <li>Use period/group selections here to drive Raw Data and Analysis comparisons.</li>
            </ul>
            <div className="p-6 pt-0">
              <button onClick={() => setShowHelp(false)} className={`${theme.bg} ${theme.hover} w-full py-3 text-white font-semibold rounded-lg`}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section 4: structure-shrink protection (reuses the shared ConfirmDialog) */}
      <ConfirmDialog
        open={!!shrink}
        variant="danger"
        title={shrink?.hasMembers ? 'Move students before shrinking' : 'Sessions will keep their group label'}
        message={shrink ? (
          shrink.hasMembers
            ? `These groups still have accounts: ${shrink.blockers.map((b) => `${b.period}·${b.group} (${b.accounts} account${b.accounts === 1 ? '' : 's'}${b.sessions ? `, ${b.sessions} session${b.sessions === 1 ? '' : 's'}` : ''})`).join(', ')}. Move those students into a kept group first. Existing sessions keep their original group label as a historical record.`
            : `These groups have sessions but no accounts: ${shrink.blockers.map((b) => `${b.period}·${b.group} (${b.sessions} session${b.sessions === 1 ? '' : 's'})`).join(', ')}. They keep their original group label as a historical record.`
        ) : ''}
        confirmLabel={shrink?.hasMembers ? 'Move students…' : 'Remove anyway'}
        confirmIcon={shrink?.hasMembers ? <MoveRight className="w-4 h-4" /> : undefined}
        onCancel={() => setShrink(null)}
        onConfirm={() => {
          if (shrink?.hasMembers) {
            const blk = shrink.blockers.find((b) => b.accounts > 0);
            const member = blk && studentMembers.find((m) => m.period === blk.period && m.group_code === blk.group);
            setShrink(null);
            if (member) openStudentAction(member, 'move');
          } else {
            setShrink(null);
            doSaveStructure();
          }
        }}
      />

      {/* Section 5: remove-account confirmation (shared ConfirmDialog) */}
      <ConfirmDialog
        open={!!removeTarget}
        variant="danger"
        title="Remove this account?"
        message={removeTarget ? `Remove ${removeTarget.username} (${removeTarget.period} · ${removeTarget.group_code}) from the roster?` : ''}
        confirmLabel="Remove"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => doRemoveStudent(removeTarget)}
      />
    </div>
  );
}
