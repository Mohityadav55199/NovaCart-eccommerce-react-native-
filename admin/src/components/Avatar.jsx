import { useState } from "react";

// profile picture with a fallback to the person's initial (empty or broken image URLs are common)
function Avatar({ src, name = "", className = "w-12 h-12" }) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] || "?").toUpperCase();

  if (!src || failed) {
    return (
      <div
        className={`${className} rounded-full bg-primary text-primary-content flex items-center justify-center font-semibold shrink-0`}
        aria-label={name}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`${className} rounded-full object-cover shrink-0`}
      onError={() => setFailed(true)}
    />
  );
}

export default Avatar;
