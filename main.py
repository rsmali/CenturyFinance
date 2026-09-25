"""
Société Générale Bank Statement Local Parser, Classifier & Visualizer
100% Local processing with PyMuPDF, Pandas, Ollama (Qwen 2.5), and Flask.
"""

import sys
import os
import glob
import argparse
import pandas as pd

from extractor import parse_sg_pdf
from classifier import classify_transactions, check_ollama_available

def run_pipeline(pdf_path: str = None, output_csv: str = "sg_clean_transactions.csv", use_ollama: bool = True):
    """
    Parses an SG bank statement PDF, classifies all transactions locally,
    and exports the result to a CSV file.
    """
    if not pdf_path:
        pdfs = glob.glob("*.pdf")
        if not pdfs:
            raise FileNotFoundError("No PDF file found in current directory.")
        # Prioritize statement PDF
        pdfs.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        pdf_path = pdfs[0]

    print(f"\n=======================================================")
    print(f"  [1/3] Extracting transactions from: {pdf_path}")
    print(f"=======================================================")
    
    df = parse_sg_pdf(pdf_path)
    if df.empty:
        print("[!] No transactions could be extracted.")
        return df

    print(f"[✓] Extracted {len(df)} transactions successfully.")

    print(f"\n=======================================================")
    print(f"  [2/3] Classifying transactions locally")
    print(f"=======================================================")
    ollama_ok = check_ollama_available()
    if ollama_ok and use_ollama:
        print("[✓] Ollama detected on localhost:11434 (using qwen2.5:7b)")
    else:
        print("[i] Using local rule-based classifier (instant & offline)")

    records = df.to_dict(orient="records")
    for i, r in enumerate(records):
        r["id"] = f"tx_{i+1}"

    classified_records = classify_transactions(records, use_ollama=use_ollama)
    df_classified = pd.DataFrame(classified_records)

    # Reorder columns cleanly
    cols = ["date", "valeur_date", "type", "amount", "category", "merchant", "description", "page"]
    avail_cols = [c for c in cols if c in df_classified.columns] + [c for c in df_classified.columns if c not in cols and c not in ["color", "icon", "id", "raw_amount"]]
    df_clean = df_classified[avail_cols]

    print(f"\n=======================================================")
    print(f"  [3/3] Exporting CSV to: {output_csv}")
    print(f"=======================================================")
    df_clean.to_csv(output_csv, index=False, encoding="utf-8-sig")
    print(f"[✓] File saved: {os.path.abspath(output_csv)}")

    # Print summary
    tot_debits = df_clean[df_clean["type"] == "Debit"]["amount"].sum()
    tot_credits = df_clean[df_clean["type"] == "Credit"]["amount"].sum()
    print("\n---------------- RÉSUMÉ DU RELEVÉ ----------------")
    print(f"  Nombre total d'opérations : {len(df_clean)}")
    print(f"  Total Débits (Dépenses)   : {tot_debits:10.2f} €")
    print(f"  Total Crédits (Revenus)   : {tot_credits:10.2f} €")
    print(f"  Solde Net du mois         : {tot_credits + tot_debits:10.2f} €")
    print("--------------------------------------------------\n")

    return df_clean

def main():
    parser = argparse.ArgumentParser(description="Century Finance: Bank Statement Extractor & Visualizer")
    parser.add_argument("--pdf", type=str, default=None, help="Path to the bank statement PDF")
    parser.add_argument("--output", type=str, default="sg_clean_transactions.csv", help="Output CSV path")
    parser.add_argument("--cli-only", action="store_true", help="Only extract and save CSV without launching web server")
    parser.add_argument("--no-ollama", action="store_true", help="Disable Ollama LLM and use rules only")
    parser.add_argument("--port", type=int, default=5001, help="Port for web dashboard (default: 5001)")
    args = parser.parse_args()

    # Step 1: Run extraction and CSV export
    df = run_pipeline(
        pdf_path=args.pdf,
        output_csv=args.output,
        use_ollama=not args.no_ollama
    )

    # Step 2: Start local server if not cli-only
    if not args.cli_only:
        from app import app
        print(f"=======================================================")
        print(f"  🚀 Century Finance Dashboard Ready!")
        print(f"  👉 Ouvrez votre navigateur sur : http://localhost:{args.port}")
        print(f"=======================================================\n")
        app.run(host="0.0.0.0", port=args.port, debug=False)

if __name__ == "__main__":
    main()