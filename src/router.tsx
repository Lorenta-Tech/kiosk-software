import { Routes, Route } from "react-router-dom";
import Home from "./Home";
import OTPPage from "./components/otp";
import MetadataPage from "./components/metadata";
import LoadingPage from "./components/loading";
import ThankYouPage from "./components/thankyou";

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/otp" element={<OTPPage />} />
      <Route path="/files" element={<MetadataPage />} />
      <Route path="/print" element={<LoadingPage />} />
      <Route path="/done" element={<ThankYouPage />} />
    </Routes>
  );
}