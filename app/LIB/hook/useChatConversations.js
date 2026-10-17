import { useCallback, useEffect, useRef, useState } from 'react';

export function useChatConversations({ api, account, setMessages, setError, run }) {
  const [conversations, setConversations] = useState([]);
  const current = useRef(account);
  current.current = account;
  const refreshConversations = useCallback(async () => {
    const owner = current.current;
    if (!owner || !api) return;
    try { const items = await api.conversations(); if (current.current === owner) setConversations(items); }
    catch (error) { if (current.current === owner) setError(error); }
  }, [api, setError]);
  useEffect(() => {
    setConversations([]);
    if (!account || !api) return;
    refreshConversations();
    return api.onEvent(event => {
      if (event.type !== 'conversations') return;
      refreshConversations();
      api.history().then(messages => { if (current.current === account) setMessages(messages); }).catch(setError);
    });
  }, [api, account, refreshConversations, setMessages, setError]);
  return {
    conversations, refreshConversations,
    selectConversation: id => run(async () => { setMessages(await api.selectConversation(id)); return true; }),
    deleteConversation: id => run(async () => { setMessages(await api.deleteConversation(id)); await refreshConversations(); return true; })
  };
}
