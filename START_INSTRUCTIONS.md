# Inicie o Backend em um terminal
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Em outro terminal, inicie o Frontend
cd frontend
npm run dev
