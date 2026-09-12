import React, { useState } from 'react';

interface ProjectModalProps {
  onClose: () => void;
  onCreate: (name: string, description?: string) => Promise<void>;
}

export function ProjectModal({ onClose, onCreate }: ProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onCreate(name.trim(), description.trim() || undefined);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">New Project</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. BigMove, BSJ7"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
              Description
            </label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Optional description"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-primary flex-1"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
