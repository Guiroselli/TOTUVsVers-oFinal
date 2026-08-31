import pytest
from repositories import MeetingRepository

def test_audit_event_recording():
    repo = MeetingRepository()
    # Grava evento de auditoria
    repo.log_audit_event(
        meeting_id="m_test_audit",
        action="update_metadata",
        details={"field": "NIVEL_URGENCIA", "new_value": "Alta"},
        author="user"
    )

    events = repo.get_audit_log(meeting_id="m_test_audit")
    assert len(events) >= 1
    last = events[-1]
    assert last["meeting_id"] == "m_test_audit"
    assert last["action"] == "update_metadata"
    assert last["author"] == "user"
    assert "timestamp" in last
