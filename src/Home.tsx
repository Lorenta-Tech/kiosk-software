import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Home() {
  const now = useClock();
  const navigate = useNavigate();

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: "#7E49F2", fontFamily: "'Sora', sans-serif" }}
    >
      <style>{`
        @keyframes dropBounce {
          0%   { transform: translateY(0px)  scaleY(1)    scaleX(1); }
          30%  { transform: translateY(0px)  scaleY(1)    scaleX(1); }
          50%  { transform: translateY(18px) scaleY(0.88) scaleX(1.06); }
          65%  { transform: translateY(-6px) scaleY(1.05) scaleX(0.97); }
          78%  { transform: translateY(4px)  scaleY(0.97) scaleX(1.02); }
          90%  { transform: translateY(-2px) scaleY(1.01) scaleX(0.99); }
          100% { transform: translateY(0px)  scaleY(1)    scaleX(1); }
        }

        .drop-bounce {
          animation: dropBounce 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          transform-origin: center bottom;
        }
      `}</style>

      {/* TOP BAR */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: "clamp(20px,3vh,40px) clamp(24px,3.5vw,48px) 0" }}
      >
        <div className="flex items-center gap-3"></div>
        <div className="text-right">
          <div
            className="text-white font-extrabold leading-none"
            style={{ fontSize: "clamp(20px,2.8vw,36px)" }}
          >
            {time}
          </div>
          <div
            className="font-medium mt-1"
            style={{ color: "rgba(255,255,255,0.62)" }}
          >
            {date}
          </div>
        </div>
      </div>

      {/* IMAGE + BUTTON CENTER */}
      <div className="flex-1 flex items-center justify-center relative">

        {/* IMAGE with drop-bounce animation */}
        <div
          className="drop-bounce"
          style={{
            position: "absolute",
            top: "22%",
            transform: "translateY(-50%)",
            width: "clamp(220px, 32vw, 340px)",
            filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.32))",
          }}
        >
          <img
            src="../public/Lorenta-1.png"
            alt="Lorenta"
            style={{ width: "100%", display: "block" }}
          />
        </div>

        {/* BUTTON */}
        <button
          onClick={() => navigate("/otp")}
          className="rounded-xl font-semibold z-10"
          style={{
            width: "180px",
            height: "52px",
            background: "white",
            border: "3px solid #7E49F2",
            boxShadow: "0px 8px 18px rgba(0,0,0,0.20)",
            color: "#7E49F2",
            fontSize: "18px",
            letterSpacing: "0.5px",
            cursor: "pointer",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
          onMouseDown={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.96)";
          }}
          onMouseUp={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          Start Now
        </button>
      </div>
    </div>
  );
}