import { CreatorHome } from "@/components/creator-home";
import { prototypeEpisodes } from "@/lib/prototype-episodes";

export default function CreatorHomePage() {
  return <CreatorHome episodes={prototypeEpisodes} />;
}
