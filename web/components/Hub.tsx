"use client";

import Link from "next/link";
import { useState } from "react";
import { LangToggle, useLang } from "@/lib/i18n";
import { useAccount } from "@/lib/account";

/** 첫 화면: 로그인 + 과목 고르기 */
export default function Hub() {
  const { lang } = useLang();
  const ko = lang === "ko";
  const acct = useAccount();
  const [err, setErr] = useState(false);
  const [menu, setMenu] = useState(false);

  const signIn = async () => {
    setErr(false);
    if (!(await acct.signIn())) setErr(true);
  };

  return (
    <main className="hub">
      <div className="hub-top">
        <div className="hub-account">
          {acct.enabled && acct.ready && acct.user && (
            <button className="hub-me" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              {acct.user.photo ? <img src={acct.user.photo} alt="" referrerPolicy="no-referrer" /> : <span className="hub-avatar">{(acct.user.name ?? acct.user.email ?? "?").slice(0, 1)}</span>}
              <span className={`hub-dot ${acct.mathError ? "err" : acct.mathBusy ? "busy" : "ok"}`} />
            </button>
          )}
        </div>
        <LangToggle />
      </div>

      {menu && acct.user && (
        <div className="hub-menu">
          <p className="hub-menu-email">{acct.user.email}</p>
          <p className="hub-menu-sync">{acct.mathError ? (ko ? "동기화 오류 · 잠시 후 다시 시도해요" : "Sync error · will retry") : ko ? "Math · Spanish 동기화 중 ✓" : "Math · Spanish synced ✓"}</p>
          <button
            className="ghost"
            onClick={async () => {
              if (!confirm(ko ? "로그아웃할까요? 이 기기의 데이터는 그대로 남아요." : "Sign out? Data on this device stays here.")) return;
              setMenu(false);
              await acct.signOut();
            }}
          >
            {ko ? "로그아웃" : "Sign out"}
          </button>
        </div>
      )}

      <nav className="hub-list">
        <Link href="/math" className="hub-tile math">
          <span className="hub-icon" aria-hidden>∑</span>
          <span className="hub-text">
            <b>Math</b>
            <small>{ko ? "애플펜슬로 한 줄씩 풀고 바로 확인" : "Solve line by line with Apple Pencil"}</small>
          </span>
          <span className="hub-arrow" aria-hidden>›</span>
        </Link>
        <Link href="/cards" className="hub-tile spanish">
          <span className="hub-icon" aria-hidden>ñ</span>
          <span className="hub-text">
            <b>Spanish</b>
            <small>{ko ? "플래시카드 · 간격 반복 복습" : "Flashcards · spaced repetition"}</small>
          </span>
          <span className="hub-arrow" aria-hidden>›</span>
        </Link>
      </nav>

      {acct.enabled && acct.ready && !acct.user && (
        <section className="hub-login">
          <p>{ko ? "로그인하면 Math와 Spanish 기록이 계정에 저장돼서 사라지지 않고, 아이폰·아이패드·맥북·PC 어디서나 똑같이 이어져요." : "Sign in to save your Math and Spanish progress to your account and continue on any iPhone, iPad, Mac or PC."}</p>
          <button className="hub-google" onClick={signIn}>
            <span className="g" aria-hidden>G</span>
            {ko ? "구글로 로그인" : "Sign in with Google"}
          </button>
          {err && <p className="hub-err">{ko ? "로그인하지 못했어요. 다시 눌러 주세요." : "Couldn't sign in. Please try again."}</p>}
        </section>
      )}
    </main>
  );
}
