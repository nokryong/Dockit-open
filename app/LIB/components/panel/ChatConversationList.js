import { t as uiText, useI18n, getDateLocale } from "../../i18n";
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Menu, Typography } from 'sud-ui';
import { PiTrash } from 'react-icons/pi';
import { floatingSurfaceStyle, contextMenuStyles } from '../../constant/uiStyles';
import useContextMenuDismiss from '../../hook/useContextMenuDismiss';

export default function ChatConversationList({ conversations, disabled, onOpen, onDelete, dark, theme }) {
  useI18n();
  const [menu, setMenu] = useState(null);
  useContextMenuDismiss(Boolean(menu), () => setMenu(null));
  return <div className="flex max-h-[50vh] w-full min-w-0 flex-col overflow-y-auto" aria-label={uiText("채팅 목록")}>
    {!conversations.length && <Typography size="sm" className="py-4 text-center">{uiText("저장된 대화가 없어요.")}</Typography>}
    {conversations.map(conversation => <div key={conversation.id} className="min-w-0"
      onDoubleClick={() => { if (!disabled) onOpen(conversation.id); }}
      onContextMenu={event => {
        event.preventDefault(); event.stopPropagation();
        if (!disabled) setMenu({ id: conversation.id, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 180)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 64)) });
      }}>
      <Button border={false} background="transparent" color="black-10" className="w-full! min-w-0! justify-start! px-2! py-2! text-left!" disabled={disabled}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onOpen(conversation.id); } }}>
        <span className="flex min-w-0 w-full flex-col items-start gap-0.5">
          <Typography size="sm" className="block w-full truncate" title={conversation.title}>{conversation.title}</Typography>
          <Typography size="xs" color={`${theme}-7`}>{new Date(conversation.updatedAt).toLocaleDateString(getDateLocale())}</Typography>
        </span>
      </Button>
    </div>)}
    {menu && createPortal(<div className={contextMenuStyles.surface} style={{ left: menu.x, top: menu.y, minWidth: 160, width: 160, ...floatingSurfaceStyle(dark) }} onClick={event => event.stopPropagation()}>
      <Menu items={[{ key: 'delete', label: <span className="flex items-center gap-2"><PiTrash />{uiText("대화 삭제")}</span>, onClick: () => { onDelete(menu.id); setMenu(null); } }]} />
    </div>, document.body)}
  </div>;
}
