from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from transformers import pipeline
from PyPDF2 import PdfReader
import uvicorn
import io

app = FastAPI()

# Load transformer summarization model
summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")

@app.post("/upload")
async def summarize_pdf(pdf: UploadFile = File(...)):
    try:
        # Read PDF bytes and extract text
        content = await pdf.read()
        reader = PdfReader(io.BytesIO(content))
        full_text = ""
        for page in reader.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"

        if not full_text.strip():
            return JSONResponse(status_code=400, content={"error": "No readable text in PDF"})

        # Summarize (truncate if too long)
        chunks = [full_text[i:i+1000] for i in range(0, len(full_text), 1000)]
        summaries = [summarizer(chunk, max_length=130, min_length=30, do_sample=False)[0]["summary_text"] for chunk in chunks[:3]]  # Limit chunks if needed
        print("🔍 Summary result:")
        print("\n".join(summaries))

        return {"summary": "\n".join(summaries)}

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    uvicorn.run("ml_server:app", host="0.0.0.0", port=3002, reload=True)
