from datetime import date

from pydantic import BaseModel


class FilingSection(BaseModel):
    title: str
    content: str


class Filing(BaseModel):
    form_type: str
    filing_date: date
    accession_number: str
    sec_url: str
    sections: list[FilingSection]


class FilingsResponse(BaseModel):
    ticker: str
    filings: list[Filing]
