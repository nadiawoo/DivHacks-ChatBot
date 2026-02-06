import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./facetime.css";
import LandingPage from "./pages/LandingPage";
import TherapySession from "./pages/TherapySession";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<TherapySession />} />
      </Routes>
    </BrowserRouter>
  );
}
