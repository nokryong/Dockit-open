"use client";
import { createContext, useContext } from "react";
// 에디터 소유자 구분용 호환 식별자 (계정·토큰·인증 없음)
const localUser = Object.freeze({ uid: "local", user_uid: "local", display_name: "로컬", displayName: "로컬" });
const value = Object.freeze({ user: localUser, userLoading: false, isLocal: true });
const UserContext = createContext(value);
export function UserProvider({ children }) { return <UserContext.Provider value={value}>{children}</UserContext.Provider>; }
export const useUser = () => useContext(UserContext);
