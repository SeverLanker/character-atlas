import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { imageUrl } from "../storage";
export function Portrait({
  image,
  className = "",
  onClick,
  label,
}: {
  image: string;
  className?: string;
  onClick?: () => void;
  label?: string;
}) {
  const [loaded, setLoaded] = useState({ image: '', url: '', failed: false });
  const url = loaded.image === image ? loaded.url : '';
  const failed = loaded.image === image && loaded.failed;
  useEffect(() => {
    let alive = true;
    setLoaded({ image, url: '', failed: false });
    if (image && !image.startsWith("builtin:"))
      imageUrl(image)
        .then((url) => {
          if (alive) setLoaded({ image, url, failed: false });
        })
        .catch(() => {
          if (alive) setLoaded({ image, url: '', failed: true });
        });
    return () => {
      alive = false;
    };
  }, [image]);
  const builtin = image.startsWith("builtin:");
  const index = builtin ? Number(image.split(":")[1]) : 0;
  const content = (
    <>
      {builtin ? (
        <div
          className="builtin-art"
          style={{
            backgroundImage: "url(/art/characters.png)",
            backgroundPosition: `${index * 50}% 28%`,
          }}
        />
      ) : url && !failed ? (
        <img
          src={url}
          alt={label ?? "角色图片"}
          onError={() => setLoaded(current => current.image === image ? { ...current, failed: true } : current)}
        />
      ) : (
        <div className="portrait-placeholder">
          <UserRound size={40} strokeWidth={1} />
          <span>
            {failed ? "图片暂不可用" : image ? "载入图片…" : "添加角色照片"}
          </span>
        </div>
      )}
    </>
  );
  return onClick ? (
    <button
      className={"portrait " + className}
      onClick={onClick}
      aria-label={label ?? "查看角色照片"}
    >
      {content}
    </button>
  ) : (
    <div className={"portrait " + className}>{content}</div>
  );
}
