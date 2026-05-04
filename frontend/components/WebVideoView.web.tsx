/**
 * Conteneur HTML <div> pour accueillir les flux vidéo d'Agora Web SDK.
 * Agora appelle `track.play(element)` qui injecte une balise <video> dedans.
 */
import { forwardRef } from "react";

type Props = {
  style?: any;
};

const WebVideoView = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const styleObj = Array.isArray(props.style)
    ? Object.assign({}, ...props.style.filter(Boolean))
    : props.style || {};

  return (
    <div
      ref={ref}
      style={{
        backgroundColor: "#000",
        overflow: "hidden",
        position: "relative",
        ...styleObj,
      }}
    />
  );
});

WebVideoView.displayName = "WebVideoView";
export default WebVideoView;
