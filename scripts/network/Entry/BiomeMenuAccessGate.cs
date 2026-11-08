#nullable enable
using System;

namespace TwoSides.Network.Entry;

// Permiso de transferencia y admision de una sola instancia de menu. Sin HTTP.
public sealed class BiomeMenuAccessGate
{
    private readonly EntryFlowCoordinator _entry;
    private EntryFlowResult? _pending, _admitted;
    private object? _owner;
    private bool _launching;
    private readonly Func<bool> _hasPending;
    internal BiomeMenuAccessGate(EntryFlowCoordinator entry, Func<bool>? hasPending = null) { _entry = entry; _hasPending = hasPending ?? (() => false); }
    public bool CanContinue
    {
        get
        {
            if (_pending is not null && !_entry.CanNavigate(_pending)) _pending = null;
            if (_owner is not null && !IsAdmitted(_owner)) { _owner = null; _admitted = null; }
            return !_hasPending() && !_launching && _pending is null && _owner is null &&
                _entry.LatestResult is { Destination: EntryDestination.BiomeMenu } result && _entry.CanNavigate(result);
        }
    }
    public bool TryNavigate(Func<bool> navigate)
    {
        if (!CanContinue) return false;
        _pending = _entry.LatestResult;
        _launching = true;
        try
        {
            if (navigate()) return true;
            _pending = null;
            return false;
        }
        catch { _pending = null; return false; }
        finally { _launching = false; }
    }
    public bool TryEnter(object owner)
    {
        var pending = _pending;
        _pending = null;
        if (_hasPending() || owner is null || _owner is not null || pending?.Destination != EntryDestination.BiomeMenu || !_entry.TryConsumeNavigation(pending)) return false;
        _owner = owner; _admitted = pending;
        return true;
    }
    public bool IsAdmitted(object owner)
    {
        var current = _entry.Current;
        return !_hasPending() && ReferenceEquals(owner, _owner) && _admitted is not null && current.Destination == EntryDestination.BiomeMenu &&
            current.Generation == _admitted.Generation && current.GameId == _admitted.GameId && current.Revision == _admitted.Revision;
    }
    public void Release(object owner) { if (ReferenceEquals(owner, _owner)) { _owner = null; _admitted = null; } }
    public void Clear() { _pending = null; _admitted = null; _owner = null; }
}
