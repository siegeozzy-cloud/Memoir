import { factOfThisOpen } from './funFactDeck'

/** `onMap`: the light 2D map is behind the text, so it switches to dark ink. */
export default function FunFact({ onMap = false }: { onMap?: boolean }) {
  return <p className={`fun-fact${onMap ? ' on-map' : ''}`}>Did you know: {factOfThisOpen()}</p>
}
