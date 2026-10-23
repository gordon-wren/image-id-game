/** An aircraft's NATO reporting name, written in capitals as NATO does ("BADGER"). */
export function NatoName({ name }: { name: string }) {
  return (
    <div className="nato-name">
      NATO name <strong>{name.toUpperCase()}</strong>
    </div>
  );
}
