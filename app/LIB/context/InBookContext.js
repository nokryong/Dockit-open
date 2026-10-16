"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef
} from "react";
import { fetchData, updateData } from "../utils/dataUtils";
import { useSaveQueue } from "../hook/useSaveQueue";
const InBookContext = createContext(null);

export function InBookProvider({ children }) {
  // 책 안에 있는지 여부
  const [isInBook, setIsInBook] = useState(false);
  // 현재 책 정보
  const [currentBook, setCurrentBook] = useState(null);
  const [detailBook, setDetailBook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const latestStateRef = useRef();

  // 책 안으로 진입
  const enterBook = useCallback((bookId, bookTitle) => {
    setIsInBook(true);
    setCurrentBook({ id: bookId, title: bookTitle });
  }, []);

  // 책에서 나감
  const exitBook = useCallback(() => {
    setIsInBook(false);
    setCurrentBook(null);
  }, []);

  // 홈으로 이동 (책에서 완전히 나감)
  const goToHome = useCallback(() => {
    setIsInBook(false);
    setCurrentBook(null);
  }, []);

  useEffect(() => {
    latestStateRef.current = {
      title,
      content,
      thumbnail
    };
  }, [title, content, thumbnail]);

  const loadBook = useCallback(async (id) => {
    setLoading(true);
    try {
      const data = await fetchData("folders", id);
      if (data.content === undefined || data.content === null) {
        setDetailBook(null);
        setError(true);
        setLoading(false);
        return;
      }

      let fetchedBook = data.content;
      setError(false);
      setDetailBook(fetchedBook);
      setTitle(fetchedBook.title || "");
      setContent(fetchedBook.content || "");
      setThumbnail(fetchedBook.thumbnail || null);
    } catch (error) {
      console.error("문서 로드 실패:", error);
      setDetailBook(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 저장 큐 처리 콜백
  const handleSaveProcess = useCallback(async (id, mergedPayload) => {
    const latestState = latestStateRef.current;
    const dataToSave = {
      ...latestState,
      ...mergedPayload
    };

    const dataForDB = {
      title: dataToSave.title,
      content: dataToSave.content,
      thumbnail: dataToSave.thumbnail
    };

    if (Object.keys(dataForDB).length > 0) {
      await updateData("folders", id, dataForDB);

      setDetailBook((prev) => ({
        ...prev,
        ...dataForDB
      }));
    }
    return true;
  }, []);

  const { isSaving, save: saveBook } = useSaveQueue(handleSaveProcess);

  const value = useMemo(() => ({
    isInBook, currentBook, enterBook, exitBook, goToHome,
    detailBook, loading, isSaving, error,
    title, content, thumbnail,
    setTitle, setContent, setThumbnail,
    loadBook, saveBook
  }), [isInBook, currentBook, enterBook, exitBook, goToHome,
    detailBook, loading, isSaving, error,
    title, content, thumbnail, loadBook, saveBook]);

  return (
    <InBookContext.Provider value={value}>
      {children}
    </InBookContext.Provider>
  );
}

export function useInBook() {
  const context = useContext(InBookContext);
  if (!context) {
    throw new Error("useInBook must be used within an InBookProvider");
  }
  return context;
}
