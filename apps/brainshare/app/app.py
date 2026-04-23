from flask import Flask, request, jsonify
from datetime import datetime
import json
import os

app = Flask(__name__)

# Context file path
CONTEXT_FILE = "team-context.json"

def load_context():
    """Load context from local file"""
    try:
        if os.path.exists(CONTEXT_FILE):
            with open(CONTEXT_FILE, 'r') as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading context: {e}")
    return {"context": [], "team_name": "Demo Team"}

def save_context(context_data):
    """Save context to local file"""
    try:
        # Write to temp file first, then rename (atomic operation)
        temp_file = CONTEXT_FILE + '.tmp'
        with open(temp_file, 'w') as f:
            json.dump(context_data, f, indent=2)
        os.rename(temp_file, CONTEXT_FILE)
    except IOError as e:
        print(f"Error saving context: {e}")
        if os.path.exists(temp_file):
            os.remove(temp_file)

# Valid team token
VALID_TOKEN = "bs_team_abc123"

def verify_auth():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return False
    token = auth_header.split(' ')[1]
    return token == VALID_TOKEN

@app.route('/analyze', methods=['POST'])
def analyze():
    if not verify_auth():
        return jsonify({"success": False, "error": "invalid_auth"}), 401
    
    data = request.json
    conversation_chunk = data.get('conversation_chunk', '')
    trigger_type = data.get('trigger_type', 'manual')
    
    # Mock intelligent analysis - expanded trigger detection
    extracted_context = []
    lower_chunk = conversation_chunk.lower()
    decision_triggers = ['decided', 'choose', 'going with', 'we should', 'lets go with', 'agreed on', 'conclusion', 'final decision']
    
    if any(trigger in lower_chunk for trigger in decision_triggers):
        extracted_context.append({
            "content": f"Extracted from conversation: {conversation_chunk[:100]}...",
            "category": "decision",
            "confidence": 0.92,
            "auto_added": True
        })
    
    # Load, update, and save context
    context_data = load_context()
    for context in extracted_context:
        context_data['context'].append({
            **context,
            "timestamp": datetime.now().isoformat()
        })
    save_context(context_data)
    
    return jsonify({
        "success": True,
        "extracted_context": extracted_context,
        "timestamp": datetime.now().isoformat()
    })

@app.route('/push', methods=['POST'])
def push():
    if not verify_auth():
        return jsonify({"success": False, "error": "invalid_auth"}), 401
    
    data = request.json
    content = data.get('content', '')
    category = data.get('category', 'knowledge')
    
    # Load, update, and save context
    context_data = load_context()
    context_item = {
        "content": content,
        "category": category,
        "compression_level": "none",
        "timestamp": datetime.now().isoformat(),
        "manual": True
    }
    context_data['context'].append(context_item)
    save_context(context_data)
    
    return jsonify({
        "success": True,
        "message": "Added to team context",
        "category": category,
        "compression_level": "none",
        "timestamp": context_item["timestamp"]
    })

@app.route('/pull', methods=['GET'])
def pull():
    if not verify_auth():
        return jsonify({"success": False, "error": "invalid_auth"}), 401
    
    query = request.args.get('query', '')
    max_tokens = int(request.args.get('max_tokens', 4000))
    
    # Load context and search with fuzzy matching
    context_data = load_context()
    relevant_context = []
    query_lower = query.lower()
    
    for item in context_data['context']:
        content_lower = item['content'].lower()
        # Better search: exact match, partial match, or word boundary match
        if (query_lower in content_lower or 
            any(word in content_lower for word in query_lower.split()) or
            any(query_word in content_word for query_word in query_lower.split() 
                for content_word in content_lower.split())):
            relevant_context.append({
                "content": item['content'],
                "category": item['category'],
                "fidelity": item.get('compression_level', 'none'),
                "relevance": 0.95,
                "timestamp": item['timestamp']
            })
    
    return jsonify({
        "success": True,
        "context": relevant_context,
        "total_tokens": sum(len(item['content'].split()) * 1.3 for item in relevant_context),  # better token estimate
        "compression_level": "light",
        "original_size": "mock compression info"
    })

@app.route('/context', methods=['GET'])
def context():
    if not verify_auth():
        return jsonify({"success": False, "error": "invalid_auth"}), 401
    
    # Load context and generate summary
    context_data = load_context()
    recent_items = context_data['context'][-10:]  # Last 10 items
    
    summary = "## Team Context\n"
    for item in recent_items:
        summary += f"- {item['content']} ({item['category']}, {item['timestamp'][:10]})\n"
    
    categories = list(set(item['category'] for item in recent_items))
    
    return jsonify({
        "success": True,
        "context_summary": summary,
        "categories": categories,
        "tokens_used": len(summary) // 4,
        "compression_level": "heavy",
        "original_size": f"{len(context_data['context'])} items compressed"
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "version": "0.1.0"})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=3000)