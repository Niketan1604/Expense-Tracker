export default function ConfirmModal({ 
  isOpen, 
  title = "Confirm Action", 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = "Confirm", 
  cancelText = "Cancel",
  isDanger = true
}: { 
  isOpen: boolean; 
  title?: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void; 
  confirmText?: string; 
  cancelText?: string;
  isDanger?: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay z-[100]">
      <div className="modal-box max-w-sm p-0 overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-bold text-text mb-2">{title}</h3>
          <p className="text-sm text-muted">{message}</p>
        </div>
        
        <div className="flex border-t border-border bg-surface-2/50">
          <button 
            onClick={onCancel} 
            className="flex-1 py-3 text-sm font-semibold text-muted hover:text-text hover:bg-surface-2 transition-colors border-r border-border"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm} 
            className={`flex-1 py-3 text-sm font-bold transition-colors hover:bg-surface-2 ${isDanger ? 'text-red hover:text-red-500' : 'text-mint hover:text-mint-600'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
