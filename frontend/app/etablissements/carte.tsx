/**
 * Route /etablissements/carte — délègue au composant CarteMap
 * (résolu par Metro en .native.tsx sur mobile, .web.tsx sur web).
 */
import CarteMap from "../../components/CarteMap";

export default function CarteRoute() {
  return <CarteMap />;
}
